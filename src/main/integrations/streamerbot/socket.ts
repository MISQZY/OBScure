import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import type { IntegrationStatus } from "../types";
import {
  computeAuthString,
  isHelloMessage,
  isEventEnvelope,
  type StreamerBotEventEnvelope,
  type StreamerBotResponseEnvelope,
} from "./protocol";

const MIN_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface StreamerBotSocketHandlers {
  isStopping(): boolean;
  setStatus(status: IntegrationStatus): void;
  /** Called once the handshake (and, if configured, auth) succeeds — the socket is ready for requests. */
  onReady(): void;
  onEvent(envelope: StreamerBotEventEnvelope): void;
  reconnect(): Promise<void>;
}

interface PendingRequest {
  resolve: (value: StreamerBotResponseEnvelope) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function parseJson(raw: WebSocket.RawData): Record<string, unknown> | null {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

/**
 * Owns the Streamer.bot WebSocket connection lifecycle: connecting, the
 * Hello/Authenticate handshake (see protocol.ts's own doc comment),
 * request/response correlation by `id`, dispatching pushed events, and the
 * reconnect-with-backoff loop — same shape as TwitchSocket, adapted for
 * Streamer.bot's request/response + push-event protocol instead of Twitch
 * EventSub's notification-only one.
 */
export class StreamerBotSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly handlers: StreamerBotSocketHandlers) {}

  async connect(url: string, password: string | null): Promise<void> {
    const socket = await this.handshake(url, password);
    this.attachSocket(socket);
    this.reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
    this.handlers.setStatus("connected");
    this.handlers.onReady();
  }

  private handshake(url: string, password: string | null): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      let settled = false;

      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      const onClose = (): void =>
        finish(() =>
          reject(new Error("Streamer.bot closed the connection before Hello")),
        );
      const onError = (error: Error): void => finish(() => reject(error));

      const onHello = (raw: WebSocket.RawData): void => {
        const message = parseJson(raw);
        if (!isHelloMessage(message)) return;
        socket.off("message", onHello);
        socket.off("close", onClose);
        socket.off("error", onError);

        if (!message.authentication) {
          finish(() => resolve(socket));
          return;
        }
        if (!password) {
          socket.terminate();
          finish(() =>
            reject(
              new Error(
                "Streamer.bot requires a password, but none is configured",
              ),
            ),
          );
          return;
        }

        const { salt, challenge } = message.authentication;
        const authString = computeAuthString(password, salt, challenge);
        const id = randomUUID();

        const onAuthClose = (): void =>
          finish(() =>
            reject(
              new Error(
                "Streamer.bot closed the connection during authentication",
              ),
            ),
          );
        const onAuthError = (error: Error): void => finish(() => reject(error));
        const onAuthResponse = (raw2: WebSocket.RawData): void => {
          const response = parseJson(raw2);
          if (!response || response.id !== id) return;
          socket.off("message", onAuthResponse);
          socket.off("close", onAuthClose);
          socket.off("error", onAuthError);
          if (response.status === "ok") {
            finish(() => resolve(socket));
          } else {
            socket.terminate();
            finish(() =>
              reject(new Error("Streamer.bot rejected the configured password")),
            );
          }
        };

        socket.on("message", onAuthResponse);
        socket.once("close", onAuthClose);
        socket.once("error", onAuthError);
        socket.send(
          JSON.stringify({ request: "Authenticate", id, authentication: authString }),
        );
      };

      socket.on("message", onHello);
      socket.once("close", onClose);
      socket.once("error", onError);
    });
  }

  private attachSocket(socket: WebSocket): void {
    this.socket = socket;

    socket.on("message", (raw) => {
      if (this.socket !== socket) return;
      const message = parseJson(raw);
      if (!message) return;

      const id = message.id as string | undefined;
      const pendingRequest = id ? this.pending.get(id) : undefined;
      if (id && pendingRequest) {
        this.pending.delete(id);
        clearTimeout(pendingRequest.timer);
        if (message.status === "error") {
          pendingRequest.reject(
            new Error(
              String((message as { error?: string }).error ?? "Streamer.bot request failed"),
            ),
          );
        } else {
          pendingRequest.resolve(message as StreamerBotResponseEnvelope);
        }
        return;
      }

      if (isEventEnvelope(message)) this.handlers.onEvent(message);
    });

    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.rejectAllPending(new Error("Streamer.bot connection closed"));
      if (this.handlers.isStopping()) return;
      this.handlers.setStatus("error");
      this.scheduleReconnect();
    });

    socket.on("error", () => {
      // 'close' always follows an 'error' — all retry logic lives in the
      // 'close' handler above, same convention as TwitchSocket.
    });
  }

  sendRequest(
    request: string,
    params: Record<string, unknown> = {},
  ): Promise<StreamerBotResponseEnvelope> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Not connected to Streamer.bot"));
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Streamer.bot request "${request}" timed out`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ request, id, ...params }));
    });
  }

  private rejectAllPending(error: Error): void {
    for (const pendingRequest of this.pending.values()) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(error);
    }
    this.pending.clear();
  }

  /** Cancels any pending reconnect attempt without scheduling a new one. */
  cancelReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  scheduleReconnect(): void {
    if (this.handlers.isStopping()) return;
    this.cancelReconnect();
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(
      this.reconnectDelayMs * 2,
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectTimer = setTimeout(() => {
      void this.handlers.reconnect();
    }, delay);
  }

  /** Clears all timers, rejects any in-flight requests, and forcibly closes the current socket, if any. */
  teardownAll(): void {
    this.cancelReconnect();
    this.rejectAllPending(new Error("Streamer.bot integration stopped"));
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.terminate();
    }
    this.socket = null;
  }
}
