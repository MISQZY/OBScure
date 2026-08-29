import { shell } from "electron";
import WebSocket from "ws";
import { BaseIntegration } from "../types";
import type {
  AlertPayload,
  ChatMessagePayload,
  PointsRedemptionPayload,
  TwitchChannelStats,
  TwitchCustomReward,
} from "../../../shared/types";

import {
  TwitchAuthError,
  fetchTwitch,
  sleep,
  waitForOnline,
  parseEventSubMessage,
  SCOPES,
  EVENTSUB_WS_URL,
  HELIX_BASE,
  DEVICE_CODE_URL,
  DEVICE_GRANT_TYPE,
  BUILTIN_CLIENT_ID,
  DEFAULT_KEEPALIVE_TIMEOUT_SECONDS,
  MIN_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  STARTUP_ONLINE_WAIT_MS,
  TwitchTokenResponse,
  DeviceCodeResponse,
  EventSubSession,
  EventSubMessage,
} from "./utils";

import {
  mapNotificationToAlert,
  mapNotificationToChatMessage,
  mapNotificationToPointsRedemption,
} from "./mappers";

export class TwitchIntegration extends BaseIntegration {
  private socket: WebSocket | null = null;
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private clientId: string | null = null;
  private broadcasterId: string | null = null;
  private keepaliveTimeoutSeconds = DEFAULT_KEEPALIVE_TIMEOUT_SECONDS;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
  private stopping = false;

  private getClientId(): string | null {
    return (
      this.config.getSetting<string | null>("twitch.clientId", null) ||
      BUILTIN_CLIENT_ID
    );
  }

  async start(): Promise<void> {
    const clientId = this.getClientId();
    const refreshToken = this.config.getSecret("twitch.refreshToken");
    if (!clientId || !refreshToken) {
      console.error("[twitch] start() found nothing to reconnect with:", {
        hasClientId: !!clientId,
        hasRefreshToken: !!refreshToken,
      });
      this.setStatus("disconnected");
      return;
    }

    this.clientId = clientId;
    this.stopping = false;
    this.setStatus("connecting");
    void this.attemptInitialConnect(clientId, refreshToken);
  }

  private async attemptInitialConnect(
    clientId: string,
    refreshToken: string,
  ): Promise<void> {
    await waitForOnline(STARTUP_ONLINE_WAIT_MS);
    try {
      await this.refreshAccessToken(clientId, refreshToken);
      await this.openSession(EVENTSUB_WS_URL);
    } catch (error) {
      this.handleConnectFailure(error);
    }
  }

  private handleConnectFailure(error: unknown): void {
    if (error instanceof TwitchAuthError) {
      console.error(
        "[twitch] refresh token rejected, dropping to disconnected:",
        error.message,
      );
      this.config.deleteSecret("twitch.refreshToken");
      this.accessToken = null;
      this.accessTokenExpiresAt = 0;
      this.clearReconnectTimer();
      this.setStatus("disconnected");
      return;
    }
    console.error(
      "[twitch] connect failed, will retry:",
      error instanceof Error ? error.message : error,
    );
    this.setStatus("error");
    this.scheduleReconnect();
  }

  stop(): void {
    this.stopping = true;
    this.clearStaleTimer();
    this.clearReconnectTimer();
    this.teardownSocket(this.socket);
    this.socket = null;
  }

  async connect(): Promise<void> {
    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error("Сначала укажи Client ID");
    }

    this.setStatus("connecting");

    const deviceUrl = new URL(DEVICE_CODE_URL);
    deviceUrl.searchParams.set("client_id", clientId);
    deviceUrl.searchParams.set("scopes", SCOPES);

    const deviceResponse = await fetchTwitch(deviceUrl, { method: "POST" });
    if (!deviceResponse.ok) {
      this.setStatus("error");
      throw new Error(
        `Twitch отклонил запрос кода устройства (${deviceResponse.status}): ${await deviceResponse.text()}`,
      );
    }
    const device = (await deviceResponse.json()) as DeviceCodeResponse;

    await shell.openExternal(device.verification_uri);

    let tokens: TwitchTokenResponse;
    try {
      tokens = await this.pollForDeviceToken(
        clientId,
        device.device_code,
        device.interval,
        device.expires_in,
      );
    } catch (error) {
      this.setStatus("error");
      throw error;
    }

    this.accessToken = tokens.access_token;
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    this.config.setSecret("twitch.refreshToken", tokens.refresh_token);
    this.clientId = clientId;
    this.stopping = false;

    try {
      await this.openSession(EVENTSUB_WS_URL);
    } catch (error) {
      this.setStatus("error");
      throw error;
    }
  }

  private async pollForDeviceToken(
    clientId: string,
    deviceCode: string,
    intervalSeconds: number,
    expiresInSeconds: number,
  ): Promise<TwitchTokenResponse> {
    const deadline = Date.now() + expiresInSeconds * 1000;
    let delayMs = Math.max(intervalSeconds, 1) * 1000;

    for (;;) {
      await sleep(delayMs);
      if (Date.now() >= deadline) {
        throw new Error("Время на подтверждение авторизации в Twitch истекло");
      }

      const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
      tokenUrl.searchParams.set("client_id", clientId);
      tokenUrl.searchParams.set("scopes", SCOPES);
      tokenUrl.searchParams.set("device_code", deviceCode);
      tokenUrl.searchParams.set("grant_type", DEVICE_GRANT_TYPE);

      const response = await fetchTwitch(tokenUrl, { method: "POST" });
      if (response.ok) {
        return (await response.json()) as TwitchTokenResponse;
      }

      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      const message = body?.message ?? "";
      if (message === "authorization_pending") continue;
      if (message === "slow_down") {
        delayMs += 5000;
        continue;
      }
      throw new Error(
        `Twitch отклонил авторизацию устройства: ${message || response.status}`,
      );
    }
  }

  disconnect(): void {
    this.config.deleteSecret("twitch.refreshToken");
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.broadcasterId = null;
    this.stop();
    this.setStatus("disconnected");
  }

  private async refreshAccessToken(
    clientId: string,
    refreshToken: string,
  ): Promise<void> {
    const tokenUrl = new URL("https://id.twitch.tv/oauth2/token");
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("grant_type", "refresh_token");
    tokenUrl.searchParams.set("refresh_token", refreshToken);

    const response = await fetchTwitch(tokenUrl, { method: "POST" });
    if (!response.ok) {
      const body = await response.text();

      if (response.status === 400 || response.status === 401) {
        throw new TwitchAuthError(
          `Twitch отклонил refresh-токен (${response.status}): ${body}`,
        );
      }
      throw new Error(
        `Не удалось обновить токен Twitch (${response.status}): ${body}`,
      );
    }

    const tokens = (await response.json()) as TwitchTokenResponse;
    this.accessToken = tokens.access_token;
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    this.config.setSecret("twitch.refreshToken", tokens.refresh_token);
  }

  private async openSession(url: string): Promise<void> {
    const { socket, session } = await this.connectAndAwaitWelcome(url);
    await this.subscribeAll(session.id);
    this.attachSocket(
      socket,
      session.keepalive_timeout_seconds ?? DEFAULT_KEEPALIVE_TIMEOUT_SECONDS,
    );
    this.setStatus("connected");
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
      this.setStatus("error");
      this.scheduleReconnect();
      return;
    }

    this.attachSocket(
      migrated.socket,
      migrated.session.keepalive_timeout_seconds ??
        this.keepaliveTimeoutSeconds,
    );
    this.setStatus("connected");
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
            this.eventBus.emit(
              "chat-message",
              mapNotificationToChatMessage(event),
            );
            break;
          }
          if (
            subscription.type ===
            "channel.channel_points_custom_reward_redemption.add"
          ) {
            this.eventBus.emit(
              "points-redemption",
              mapNotificationToPointsRedemption(event),
            );
            break;
          }
          const alert = mapNotificationToAlert(subscription.type, event);
          if (alert) this.eventBus.emit("alert", alert);
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
      if (this.stopping) return;
      this.setStatus("error");
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
      if (this.stopping) return;
      this.setStatus("error");
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

  private scheduleReconnect(): void {
    if (this.stopping) return;
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
    if (this.stopping) return;
    const clientId = this.clientId;
    const refreshToken = this.config.getSecret("twitch.refreshToken");
    if (!clientId || !refreshToken) {
      this.setStatus("disconnected");
      return;
    }

    this.setStatus("connecting");
    try {
      await this.refreshAccessToken(clientId, refreshToken);
      await this.openSession(EVENTSUB_WS_URL);
    } catch (error) {
      this.handleConnectFailure(error);
    }
  }

  private async fetchBroadcasterId(): Promise<string> {
    if (this.broadcasterId) return this.broadcasterId;
    if (!this.clientId || !this.accessToken) {
      throw new Error("Нет токена Twitch для запроса профиля");
    }

    const response = await fetchTwitch(`${HELIX_BASE}/users`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Client-Id": this.clientId,
      },
    });
    if (!response.ok) {
      throw new Error(
        `Не удалось получить профиль Twitch (${response.status})`,
      );
    }

    const body = (await response.json()) as { data: Array<{ id: string }> };
    const id = body.data[0]?.id;
    if (!id) {
      throw new Error("Twitch не вернул профиль пользователя");
    }
    this.broadcasterId = id;
    return id;
  }

  async isSubscriber(userId: string): Promise<boolean> {
    if (!this.clientId || !this.accessToken || !userId) return false;
    const broadcasterId = await this.fetchBroadcasterId();
    const response = await fetchTwitch(
      `${HELIX_BASE}/subscriptions?broadcaster_id=${broadcasterId}&user_id=${userId}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Client-Id": this.clientId,
        },
      },
    );
    if (!response.ok) return false;
    const body = (await response.json()) as { data: unknown[] };
    return body.data.length > 0;
  }

  async isFollower(userId: string): Promise<boolean> {
    if (!this.clientId || !this.accessToken || !userId) return false;
    const broadcasterId = await this.fetchBroadcasterId();
    const response = await fetchTwitch(
      `${HELIX_BASE}/channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Client-Id": this.clientId,
        },
      },
    );
    if (!response.ok) return false;
    const body = (await response.json()) as { data: unknown[] };
    return body.data.length > 0;
  }

  async getCustomRewards(): Promise<TwitchCustomReward[]> {
    if (!this.clientId || !this.accessToken) return [];
    const broadcasterId = await this.fetchBroadcasterId();
    const response = await fetchTwitch(
      `${HELIX_BASE}/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Client-Id": this.clientId,
        },
      },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as {
      data: Array<{ id: string; title: string }>;
    };
    return body.data.map((reward) => ({ id: reward.id, title: reward.title }));
  }

  async getChannelStats(): Promise<TwitchChannelStats | null> {
    if (!this.clientId || !this.accessToken) return null;
    const broadcasterId = await this.fetchBroadcasterId();
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      "Client-Id": this.clientId,
      "Cache-Control": "no-cache",
    };

    const bust = `_=${Date.now()}`;
    const init = { headers };

    const [streamResponse, followersResponse, subsResponse] = await Promise.all(
      [
        fetchTwitch(
          `${HELIX_BASE}/streams?user_id=${broadcasterId}&${bust}`,
          init,
        ),
        fetchTwitch(
          `${HELIX_BASE}/channels/followers?broadcaster_id=${broadcasterId}&${bust}`,
          init,
        ),
        fetchTwitch(
          `${HELIX_BASE}/subscriptions?broadcaster_id=${broadcasterId}&first=1&${bust}`,
          init,
        ),
      ],
    );

    const stream = streamResponse.ok
      ? (
          (await streamResponse.json()) as {
            data: Array<{
              viewer_count: number;
              title: string;
              game_name: string;
              started_at: string;
            }>;
          }
        ).data[0]
      : undefined;
    const followers = followersResponse.ok
      ? ((await followersResponse.json()) as { total?: number })
      : {};
    const subs = subsResponse.ok
      ? ((await subsResponse.json()) as { total?: number })
      : {};

    return {
      isLive: Boolean(stream),
      viewerCount: stream ? stream.viewer_count : null,
      title: stream ? stream.title : null,
      gameName: stream ? stream.game_name || null : null,
      startedAt: stream ? stream.started_at : null,
      followerCount:
        typeof followers.total === "number" ? followers.total : null,
      subscriberCount: typeof subs.total === "number" ? subs.total : null,
    };
  }

  private async subscribeAll(sessionId: string): Promise<void> {
    const broadcasterId = await this.fetchBroadcasterId();
    const subscriptions: Array<{
      type: string;
      version: string;
      condition: Record<string, string>;
    }> = [
      {
        type: "channel.subscribe",
        version: "1",
        condition: { broadcaster_user_id: broadcasterId },
      },
      {
        type: "channel.raid",
        version: "1",
        condition: { to_broadcaster_user_id: broadcasterId },
      },
      {
        type: "channel.follow",
        version: "2",
        condition: {
          broadcaster_user_id: broadcasterId,
          moderator_user_id: broadcasterId,
        },
      },
      {
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: broadcasterId,
          user_id: broadcasterId,
        },
      },
      {
        type: "channel.channel_points_custom_reward_redemption.add",
        version: "1",
        condition: { broadcaster_user_id: broadcasterId },
      },
    ];

    for (const subscription of subscriptions) {
      await this.createSubscription(
        subscription.type,
        subscription.version,
        subscription.condition,
        sessionId,
      );
    }
  }

  private async createSubscription(
    type: string,
    version: string,
    condition: Record<string, string>,
    sessionId: string,
  ): Promise<void> {
    if (!this.clientId || !this.accessToken) {
      throw new Error("Нет токена Twitch для подписки на события");
    }

    const response = await fetchTwitch(`${HELIX_BASE}/eventsub/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Client-Id": this.clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        version,
        condition,
        transport: { method: "websocket", session_id: sessionId },
      }),
    });

    if (!response.ok && response.status !== 409) {
      throw new Error(
        `Twitch отклонил подписку на ${type} (${response.status})`,
      );
    }
  }
}
