import { BaseIntegration } from "../types";
import { logWarn } from "../../logger";
import type { EventBus } from "../../eventBus";
import type { ConfigStore } from "../../configStore";
import type { CredentialsStore } from "../../credentialsStore";
import type { IntegrationKey } from "../../../shared/types";
import { AUDIO_LEVELS_BAND_COUNT } from "../../../shared/audioLevels";
import { ObsSocket } from "./socket";
import {
  inputLevel,
  synthesizeBands,
  type ObsEventMessage,
  type ObsGetInputListResponse,
  type ObsInputVolumeMetersEventData,
} from "./protocol";

const DEFAULT_HOST = "127.0.0.1";
// OBS's own real default WebSocket port (Tools -> WebSocket Server Settings).
const DEFAULT_PORT = "4455";

/**
 * Persisted "the user actually wants this" flag — same shape/reasoning as
 * StreamerBotIntegration's own ENABLED_SETTING_KEY: OBS has no OAuth token
 * to gate auto-reconnect-on-launch on, so without this every app launch
 * would attempt (and log a warning for) a connection for a user who's never
 * touched this integration at all.
 */
const ENABLED_SETTING_KEY = "obs.enabled";

/**
 * Connects to OBS's own built-in WebSocket server (obs-websocket v5, Tools
 * -> WebSocket Server Settings in OBS ≥ 28) purely to read real-time audio
 * levels for whichever inputs are in the user's OBS mixer — feeds an
 * Equalizer node wired to an "OBS" Audio Source (see AudioSourceNode.tsx)
 * with a level SYNTHESIZED from OBS's own peak/magnitude meter, since
 * obs-websocket exposes no per-frequency spectrum at all (see
 * synthesizeBands' own doc comment in protocol.ts). `onLevels` is called
 * directly on every InputVolumeMeters tick — not routed through `eventBus`
 * like this app's other polled integrations, since that would add a
 * needless indirection for something firing up to ~30-60x/sec; mirrors how
 * main/audioCapture.ts's own hidden capture window already reports its
 * levels straight into a constructor-injected callback.
 */
export class ObsIntegration extends BaseIntegration {
  private stopping = false;
  private loggedConnectFailure = false;
  private readonly socket: ObsSocket;

  constructor(
    key: IntegrationKey,
    eventBus: EventBus,
    config: ConfigStore,
    credentials: CredentialsStore,
    private readonly onLevels: (key: string, bands: number[]) => void,
  ) {
    super(key, eventBus, config, credentials);
    this.socket = new ObsSocket({
      isStopping: () => this.stopping,
      setStatus: (status) => this.setStatus(status),
      onReady: () => this.onReady(),
      onEvent: (message) => this.handleEvent(message),
      reconnect: () => this.establishConnection(),
    });
  }

  private buildUrl(): string {
    const host = this.config.getSetting("obs.host", DEFAULT_HOST);
    const portSetting = this.config.getSetting("obs.port", DEFAULT_PORT);
    const port = Number(portSetting) || Number(DEFAULT_PORT);
    return `ws://${host}:${port}`;
  }

  private getPassword(): string | null {
    return this.credentials.getClientId("obs.password");
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
        logWarn("obs", "connect failed, will keep retrying in the background", error);
      }
      this.setStatus("error");
      this.socket.scheduleReconnect();
    }
  }

  private onReady(): void {
    // Nothing else to do — event subscriptions are already part of Identify
    // (see buildIdentifyMessage in protocol.ts), and unlike Streamer.bot's
    // own GetGlobals there's no periodic poll needed here: InputVolumeMeters
    // is a continuous push once subscribed.
  }

  private handleEvent(message: ObsEventMessage): void {
    if (message.d.eventType !== "InputVolumeMeters") return;
    const data = message.d.eventData as unknown as ObsInputVolumeMetersEventData;
    for (const input of data.inputs ?? []) {
      const level = inputLevel(input.inputLevelsMul ?? []);
      this.onLevels(`obs:${input.inputName}`, synthesizeBands(level, AUDIO_LEVELS_BAND_COUNT));
    }
  }

  /** Every current OBS input's own name, for the Audio Source node's own OBS-source dropdown (see AudioSourceNode.tsx) — fetched fresh on demand rather than cached/polled, since input lists change rarely. `[]` when not connected. */
  async getInputList(): Promise<string[]> {
    if (this.status !== "connected") return [];
    try {
      const response = await this.socket.sendRequest("GetInputList");
      const data = response.d.responseData as unknown as ObsGetInputListResponse | undefined;
      return (data?.inputs ?? []).map((input) => input.inputName);
    } catch (error) {
      logWarn("obs", "GetInputList failed", error);
      return [];
    }
  }

  stop(): void {
    this.stopping = true;
    this.socket.teardownAll();
    this.loggedConnectFailure = false;
    this.setStatus("disconnected");
  }

  /** Explicit "Connect" button — same shape as StreamerBotIntegration's own connect(): a failure here is reported straight back to the caller (so the button can show it) rather than backgrounded into the retry loop, and marks the integration ENABLED regardless of outcome (see ENABLED_SETTING_KEY's own doc comment). */
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
