import { BaseIntegration } from "../types";
import { logWarn } from "../../logger";
import type { EventBus } from "../../eventBus";
import type { ConfigStore } from "../../configStore";
import type { CredentialsStore } from "../../credentialsStore";
import type {
  IntegrationKey,
  StreamerBotGlobalVariable,
} from "../../../shared/types";
import { StreamerBotSocket } from "./socket";
import {
  toGlobalVariables,
  type StreamerBotCommandTriggeredData,
  type StreamerBotCustomEventData,
  type StreamerBotEventEnvelope,
  type StreamerBotGetGlobalsResponse,
} from "./protocol";

const DEFAULT_HOST = "127.0.0.1";
// Stored as a string, not a number — it's edited through the same plain
// text-field settings pipeline as host/endpoint (see SettingTextField),
// which always round-trips values as strings.
const DEFAULT_PORT = "8080";
const DEFAULT_ENDPOINT = "/";
const GLOBALS_POLL_INTERVAL_MS = 5_000;

/**
 * Persisted "the user actually wants this" flag — set on every explicit
 * connect() (even a failed one: clicking Connect IS opting in) and cleared
 * on disconnect(). Unlike Twitch/YouTube (whose stored refresh token already
 * doubles as this signal) Streamer.bot has no credential to gate on, so
 * without this, start() would attempt a connection — and log a warning on
 * every retry — for every user who has never touched this integration at
 * all, the moment the app launches.
 */
const ENABLED_SETTING_KEY = "streamerbot.enabled";

/**
 * Connects to Streamer.bot's own WebSocket server (Servers/Clients →
 * WebSocket Server in Streamer.bot itself — see docs.streamer.bot/api/websocket).
 * Unlike Twitch/YouTube/Spotify, this has no OAuth of its own — `start()`
 * only attempts a connection (using whatever host/port/endpoint/password are
 * configured) when ENABLED_SETTING_KEY is set, i.e. the user has connected
 * at least once before; see that constant's own doc comment for why.
 */
export class StreamerBotIntegration extends BaseIntegration {
  private stopping = false;
  private latestGlobals: StreamerBotGlobalVariable[] = [];
  /** Deduped so a losing retry streak (Streamer.bot not running, wrong port, ...) logs once, not every 1-30s backoff tick — same convention as WindowsMediaIntegration's own lastLoggedFailure. */
  private loggedConnectFailure = false;
  private readonly socket: StreamerBotSocket;

  constructor(
    key: IntegrationKey,
    eventBus: EventBus,
    config: ConfigStore,
    credentials: CredentialsStore,
  ) {
    super(key, eventBus, config, credentials);
    this.socket = new StreamerBotSocket({
      isStopping: () => this.stopping,
      setStatus: (status) => this.setStatus(status),
      onReady: () => void this.onReady(),
      onEvent: (envelope) => this.handleEvent(envelope),
      reconnect: () => this.establishConnection(),
    });
  }

  private buildUrl(): string {
    const host = this.config.getSetting("streamerbot.host", DEFAULT_HOST);
    const portSetting = this.config.getSetting("streamerbot.port", DEFAULT_PORT);
    const port = Number(portSetting) || Number(DEFAULT_PORT);
    const endpoint = this.config.getSetting(
      "streamerbot.endpoint",
      DEFAULT_ENDPOINT,
    );
    const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `ws://${host}:${port}${path}`;
  }

  private getPassword(): string | null {
    return this.credentials.getClientId("streamerbot.password");
  }

  async start(): Promise<void> {
    if (!this.config.getSetting(ENABLED_SETTING_KEY, false)) {
      this.setStatus("disconnected");
      return;
    }
    this.stopping = false;
    this.setStatus("connecting");
    await this.establishConnection();
  }

  private async establishConnection(): Promise<void> {
    try {
      await this.socket.connect(this.buildUrl(), this.getPassword());
      this.loggedConnectFailure = false;
    } catch (error) {
      if (!this.loggedConnectFailure) {
        this.loggedConnectFailure = true;
        logWarn("streamerbot", "connect failed, will keep retrying in the background", error);
      }
      this.setStatus("error");
      this.socket.scheduleReconnect();
    }
  }

  private async onReady(): Promise<void> {
    try {
      await this.socket.sendRequest("Subscribe", {
        events: { Command: ["Triggered"], Custom: ["Event"] },
      });
    } catch (error) {
      logWarn("streamerbot", "failed to subscribe to events", error);
    }
    this.startPolling(() => this.pollGlobals(), GLOBALS_POLL_INTERVAL_MS);
  }

  /** Feeds a scope='integration', integration='streamerbot' Variable node's live value — see AppEvents' own 'streamerbot-globals' doc comment and OverlayServer.setStreamerBotGlobals. Streamer.bot's WS API has no push notification for a variable write, so this is polled, same reasoning as TwitchIntegration's own pollStats. */
  private async pollGlobals(): Promise<void> {
    try {
      const response = (await this.socket.sendRequest("GetGlobals", {
        persisted: true,
      })) as StreamerBotGetGlobalsResponse;
      this.latestGlobals = toGlobalVariables(response);
      this.eventBus.emit("streamerbot-globals", this.latestGlobals);
    } catch (error) {
      logWarn("streamerbot", "GetGlobals poll failed", error);
    }
  }

  private handleEvent(envelope: StreamerBotEventEnvelope): void {
    if (
      envelope.event.source === "Command" &&
      envelope.event.type === "Triggered"
    ) {
      const data = envelope.data as StreamerBotCommandTriggeredData | null;
      this.eventBus.emit("streamerbot-trigger", {
        kind: "command",
        command: data?.command ?? null,
        eventName: null,
        args: null,
        user: data?.user?.display ?? data?.user?.name ?? null,
      });
      return;
    }
    if (envelope.event.source === "Custom" && envelope.event.type === "Event") {
      const data = envelope.data as StreamerBotCustomEventData | null;
      this.eventBus.emit("streamerbot-trigger", {
        kind: "customEvent",
        command: null,
        eventName: data?.eventName ?? null,
        args: data?.args ?? null,
        user: null,
      });
    }
  }

  getGlobalVariables(): StreamerBotGlobalVariable[] {
    return this.latestGlobals;
  }

  stop(): void {
    this.stopping = true;
    this.stopPolling();
    this.socket.teardownAll();
    this.latestGlobals = [];
    this.loggedConnectFailure = false;
    this.eventBus.emit("streamerbot-globals", []);
    this.setStatus("disconnected");
  }

  /** Explicit "Connect" button — unlike start()/establishConnection() (the automatic path, which backgrounds a failure into the retry loop), a failure here is reported straight back to the caller so the button can show it, same as TwitchIntegration/YoutubeIntegration's own connect(). Marks the integration ENABLED regardless of whether this attempt itself succeeds — clicking Connect at all is the opt-in that lets future app launches auto-reconnect (see ENABLED_SETTING_KEY's own doc comment). */
  async connect(): Promise<void> {
    this.config.setSetting(ENABLED_SETTING_KEY, true);
    this.stopping = false;
    this.setStatus("connecting");
    try {
      await this.socket.connect(this.buildUrl(), this.getPassword());
      this.loggedConnectFailure = false;
    } catch (error) {
      this.setStatus("error");
      throw error;
    }
  }

  disconnect(): void {
    this.config.setSetting(ENABLED_SETTING_KEY, false);
    this.stop();
  }
}
