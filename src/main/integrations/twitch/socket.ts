import WebSocket from "ws";
import type { EventBus } from "../../eventBus";
import type { IntegrationStatus } from "../types";
import { refreshAccessToken } from "./auth";
import {
  parseEventSubMessage,
  DEFAULT_KEEPALIVE_TIMEOUT_SECONDS,
  MIN_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  EVENTSUB_WS_URL,
  EventSubSession,
  TwitchTokenResponse,
} from "./utils";

import {
  mapNotificationToAlert,
  mapNotificationToChatMessage,
  mapNotificationToPointsRedemption,
} from "./mappers";

/** Hooks that let TwitchSocket delegate back into TwitchIntegration's state. */
export interface TwitchSocketHandlers {
  isStopping(): boolean;
  getClientId(): string | null;
  getRefreshToken(): string | null;
  applyTokens(tokens: TwitchTokenResponse): void;
  setStatus(status: IntegrationStatus): void;
  subscribeAll(sessionId: string): Promise<void>;
  onConnectFailure(error: unknown): void;
  eventBus: EventBus;
}

/**
 * Owns the EventSub WebSocket connection lifecycle: connecting, welcome
 * handshake, subscription-session migration, stale-connection detection and
 * the reconnect-with-backoff loop.
 */
export class TwitchSocket {
  private socket: WebSocket | null = null;
  private keepaliveTimeoutSeconds = DEFAULT_KEEPALIVE_TIMEOUT_SECONDS;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = MIN_RECONNECT_DELAY_MS;

  constructor(private readonly handlers: TwitchSocketHandlers) {}

  async openSession(url: string): Promise<void> {
    const { socket, session } = await this.connectAndAwaitWelcome(url);
    await this.handlers.subscribeAll(session.id);
    this.attachSocket(
      socket,
      session.keepalive_timeout_seconds ?? DEFAULT_KEEPALIVE_TIMEOUT_SECONDS,
    );
    this.handlers.setStatus("connected");
    this.reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
  }

  private async migrateSession(reconnectUrl: string): Promise<void> {
    const previousSocket = this.socket;
    let migrated: { socket: WebSocket; session: EventSubSession };
    try {
      migrated = await this.connectAndAwaitWelcome(reconnectUrl);
    } catch {
      this.teardownSocket(previousSocket);
      if (this.socket === previousSocket) this.socket = null;
      this.handlers.setStatus("error");
      this.scheduleReconnect();
      return;
    }

    this.attachSocket(
      migrated.socket,
      migrated.session.keepalive_timeout_seconds ??
        this.keepaliveTimeoutSeconds,
    );
    this.handlers.setStatus("connected");
    this.teardownSocket(previousSocket);
  }

  private connectAndAwaitWelcome(
    url: string,
  ): Promise<{ socket: WebSocket; session: EventSubSession }> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      let settled = false;

      const onMessage = (raw: WebSocket.RawData): void => {
        const message = parseEventSubMessage(raw);
        if (message?.metadata.message_type === "session_welcome") {
          settled = true;
          socket.off("message", onMessage);
          socket.off("close", onClose);
          socket.off("error", onError);
          resolve({
            socket,
            session: (message as { payload: { session: EventSubSession } })
              .payload.session,
          });
        }
      };
      const onClose = (): void => {
        if (settled) return;
        reject(
          new Error("Twitch EventSub закрыл соединение до session_welcome"),
        );
      };
      const onError = (error: Error): void => {
        if (settled) return;
        reject(error);
      };

      socket.on("message", onMessage);
      socket.once("close", onClose);
      socket.once("error", onError);
    });
  }

  private attachSocket(
    socket: WebSocket,
    keepaliveTimeoutSeconds: number,
  ): void {
    this.socket = socket;
    this.keepaliveTimeoutSeconds = keepaliveTimeoutSeconds;
    this.resetStaleTimer();

    socket.on("message", (raw) => {
      if (this.socket !== socket) return;
      this.resetStaleTimer();

      const message = parseEventSubMessage(raw);
      if (!message) return;

      switch (message.metadata.message_type) {
        case "session_reconnect": {
          const reconnectUrl = (
            message as { payload: { session: EventSubSession } }
          ).payload.session.reconnect_url;
          if (reconnectUrl) void this.migrateSession(reconnectUrl);
          break;
        }
        case "notification": {
          const { subscription, event } = (
            message as {
              payload: {
                subscription: { type: string };
                event: Record<string, unknown>;
              };
            }
          ).payload;

          if (subscription.type === "channel.chat.message") {
            this.handlers.eventBus.emit(
              "chat-message",
              mapNotificationToChatMessage(event),
            );
            break;
          }
          if (
            subscription.type ===
            "channel.channel_points_custom_reward_redemption.add"
          ) {
            this.handlers.eventBus.emit(
              "points-redemption",
              mapNotificationToPointsRedemption(event),
            );
            break;
          }
          const alert = mapNotificationToAlert(subscription.type, event);
          if (alert) this.handlers.eventBus.emit("alert", alert);
          break;
        }
        default:
          break;
      }
    });

    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearStaleTimer();
      if (this.handlers.isStopping()) return;
      this.handlers.setStatus("error");
      this.scheduleReconnect();
    });

    socket.on("error", () => {
      // 'close' always follows; the retry is driven from there.
    });
  }

  private resetStaleTimer(): void {
    this.clearStaleTimer();
    const timeoutMs = (this.keepaliveTimeoutSeconds + 5) * 1000;
    this.staleTimer = setTimeout(() => {
      const deadSocket = this.socket;
      this.socket = null;
      this.teardownSocket(deadSocket);
      if (this.handlers.isStopping()) return;
      this.handlers.setStatus("error");
      this.scheduleReconnect();
    }, timeoutMs);
  }

  private clearStaleTimer(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private teardownSocket(socket: WebSocket | null): void {
    if (!socket) return;
    socket.removeAllListeners();
    socket.terminate();
  }

  /** Cancels any pending reconnect attempt without scheduling a new one. */
  cancelReconnect(): void {
    this.clearReconnectTimer();
  }

  scheduleReconnect(): void {
    if (this.handlers.isStopping()) return;
    this.clearReconnectTimer();
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(
      this.reconnectDelayMs * 2,
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectTimer = setTimeout(() => {
      void this.reconnect();
    }, delay);
  }

  private async reconnect(): Promise<void> {
    if (this.handlers.isStopping()) return;
    const clientId = this.handlers.getClientId();
    const refreshToken = this.handlers.getRefreshToken();
    if (!clientId || !refreshToken) {
      this.handlers.setStatus("disconnected");
      return;
    }

    this.handlers.setStatus("connecting");
    try {
      const tokens = await refreshAccessToken(clientId, refreshToken);
      this.handlers.applyTokens(tokens);
      await this.openSession(EVENTSUB_WS_URL);
    } catch (error) {
      this.handlers.onConnectFailure(error);
    }
  }

  /** Clears all timers and forcibly closes the current socket, if any. */
  teardownAll(): void {
    this.clearStaleTimer();
    this.clearReconnectTimer();
    this.teardownSocket(this.socket);
    this.socket = null;
  }
}
