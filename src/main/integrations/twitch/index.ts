import { shell } from "electron";
import { BaseIntegration } from "../types";
import { logInfo, logWarn } from "../../logger";
import type { EventBus } from "../../eventBus";
import type { ConfigStore } from "../../configStore";
import type { CredentialsStore } from "../../credentialsStore";
import type {
  IntegrationKey,
  TwitchChannelStats,
  TwitchCustomReward,
} from "../../../shared/types";

import {
  TwitchAuthError,
  fetchTwitch,
  waitForOnline,
  SCOPES,
  EVENTSUB_WS_URL,
  HELIX_BASE,
  DEVICE_CODE_URL,
  STARTUP_ONLINE_WAIT_MS,
  TwitchTokenResponse,
  DeviceCodeResponse,
} from "./utils";

import { getClientId, pollForDeviceToken, refreshAccessToken } from "./auth";
import { TwitchSocket } from "./socket";

export class TwitchIntegration extends BaseIntegration {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private clientId: string | null = null;
  private broadcasterId: string | null = null;
  private stopping = false;
  private readonly twitchSocket: TwitchSocket;

  constructor(
    key: IntegrationKey,
    eventBus: EventBus,
    config: ConfigStore,
    credentials: CredentialsStore,
  ) {
    super(key, eventBus, config, credentials);
    this.twitchSocket = new TwitchSocket({
      isStopping: () => this.stopping,
      setStatus: (status) => this.setStatus(status),
      subscribeAll: (sessionId) => this.subscribeAll(sessionId),
      reconnect: () => this.reconnect(),
      eventBus: this.eventBus,
    });
  }

  async start(): Promise<void> {
    const clientId = getClientId(this.credentials);
    const refreshToken = this.credentials.getSecret("twitch.refreshToken");
    if (!clientId || !refreshToken) {
      logInfo(
        "twitch",
        `start() found nothing to reconnect with (hasClientId=${!!clientId}, hasRefreshToken=${!!refreshToken})`,
      );
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
    await this.establishConnection(clientId, refreshToken);
  }

  /** Re-derives credentials from stored state and (re)establishes the socket. */
  private async reconnect(): Promise<void> {
    const clientId = this.clientId;
    const refreshToken = this.credentials.getSecret("twitch.refreshToken");
    if (!clientId || !refreshToken) {
      this.setStatus("disconnected");
      return;
    }

    this.setStatus("connecting");
    await this.establishConnection(clientId, refreshToken);
  }

  private async establishConnection(
    clientId: string,
    refreshToken: string,
  ): Promise<void> {
    try {
      const tokens = await refreshAccessToken(clientId, refreshToken);
      this.applyTokens(tokens);
      await this.twitchSocket.openSession(EVENTSUB_WS_URL);
    } catch (error) {
      this.handleConnectFailure(error);
    }
  }

  private handleConnectFailure(error: unknown): void {
    if (error instanceof TwitchAuthError) {
      logWarn("twitch", "refresh token rejected, dropping to disconnected", error);
      this.credentials.deleteSecret("twitch.refreshToken");
      this.accessToken = null;
      this.accessTokenExpiresAt = 0;
      this.twitchSocket.cancelReconnect();
      this.setStatus("disconnected");
      return;
    }
    logWarn("twitch", "connect failed, will retry", error);
    this.setStatus("error");
    this.twitchSocket.scheduleReconnect();
  }

  stop(): void {
    this.stopping = true;
    this.twitchSocket.teardownAll();
  }

  async connect(): Promise<void> {
    const clientId = getClientId(this.credentials);
    if (!clientId) {
      throw new Error("Set a Client ID first");
    }

    this.setStatus("connecting");

    const deviceUrl = new URL(DEVICE_CODE_URL);
    deviceUrl.searchParams.set("client_id", clientId);
    deviceUrl.searchParams.set("scopes", SCOPES);

    const deviceResponse = await fetchTwitch(deviceUrl, { method: "POST" });
    if (!deviceResponse.ok) {
      this.setStatus("error");
      throw new Error(
        `Twitch rejected the device code request (${deviceResponse.status}): ${await deviceResponse.text()}`,
      );
    }
    const device = (await deviceResponse.json()) as DeviceCodeResponse;

    await shell.openExternal(device.verification_uri);

    let tokens: TwitchTokenResponse;
    try {
      tokens = await pollForDeviceToken(
        clientId,
        device.device_code,
        device.interval,
        device.expires_in,
      );
    } catch (error) {
      this.setStatus("error");
      throw error;
    }

    this.applyTokens(tokens);
    this.clientId = clientId;
    this.stopping = false;

    try {
      await this.twitchSocket.openSession(EVENTSUB_WS_URL);
    } catch (error) {
      this.setStatus("error");
      throw error;
    }
  }

  disconnect(): void {
    this.credentials.deleteSecret("twitch.refreshToken");
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.broadcasterId = null;
    this.stop();
    this.setStatus("disconnected");
  }

  private applyTokens(tokens: TwitchTokenResponse): void {
    this.accessToken = tokens.access_token;
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    this.credentials.setSecret("twitch.refreshToken", tokens.refresh_token);
  }

  private async fetchBroadcasterId(): Promise<string> {
    if (this.broadcasterId) return this.broadcasterId;
    if (!this.clientId || !this.accessToken) {
      throw new Error("No Twitch token to request the profile with");
    }

    const response = await fetchTwitch(`${HELIX_BASE}/users`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Client-Id": this.clientId,
      },
    });
    if (!response.ok) {
      // 401 here means the client ID and/or token themselves are invalid —
      // not a transient failure. Surfacing it as TwitchAuthError (see
      // handleConnectFailure) stops the reconnect loop instead of retrying
      // forever against credentials that can never succeed.
      if (response.status === 401) {
        throw new TwitchAuthError(
          `Twitch rejected the Client ID or token while fetching the profile (401)`,
        );
      }
      throw new Error(
        `Failed to fetch the Twitch profile (${response.status})`,
      );
    }

    const body = (await response.json()) as { data: Array<{ id: string }> };
    const id = body.data[0]?.id;
    if (!id) {
      throw new Error("Twitch didn't return a user profile");
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
      throw new Error("No Twitch token to subscribe to events with");
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

    if (!response.ok) {
      // Same reasoning as fetchBroadcasterId: a 401 means the client
      // ID/token are invalid, not a transient failure — stop retrying.
      if (response.status === 401) {
        throw new TwitchAuthError(
          `Twitch rejected the Client ID or token while subscribing to ${type} (401)`,
        );
      }
      // 409 = duplicate (already subscribed, harmless).
      // 429 = subscription unavailable for this channel tier (e.g. channel.subscribe
      //        requires affiliate/partner status) — treat as a soft skip so the rest
      //        of the subscriptions proceed and the reconnect loop is not triggered.
      if (response.status === 409 || response.status === 429) {
        logWarn(
          "twitch",
          `skipping subscription to ${type} (${response.status}) — not available for this channel`,
        );
        return;
      }
      throw new Error(
        `Twitch rejected the subscription to ${type} (${response.status})`,
      );
    }
  }
}
