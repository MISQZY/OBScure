import { app, ipcMain, shell } from "electron";
import type { BrowserWindow } from "electron";
import { getFonts } from "font-list";
import type { ConfigStore } from "../configStore";
import type { CredentialsStore } from "../credentialsStore";
import type { WindowsMediaIntegration } from "../integrations/windowsMedia";
import type { StreamerBotIntegration } from "../integrations/streamerbot";
import type { ObsIntegration } from "../integrations/obs";
import type { SettingKey } from "../../shared/types";
import {
  normalizeCanvasConfig,
  type CanvasConfig,
} from "../../shared/canvasConfig";

interface SettingsHandlersDeps {
  config: () => ConfigStore;
  credentials: () => CredentialsStore;
  mainWindow: () => BrowserWindow | null;
  windowsMedia: () => WindowsMediaIntegration;
  streamerbot: () => StreamerBotIntegration;
  obs: () => ObsIntegration;
  getStoredCanvasConfig: () => CanvasConfig;
  canvasConfigSettingKey: string;
  /** Called right after "app.minimizeToTray" is written — lets the tray icon be torn down immediately when the setting is turned off, instead of lingering until quit. */
  onMinimizeToTrayChanged: (enabled: boolean) => void;
}

/** Client ID / client secret keys — persisted via CredentialsStore, not ConfigStore. streamerbot.password isn't an OAuth token either (same reasoning as youtube.clientSecret), so it's stored the same "sensitive but not OS-encrypted" way rather than through ConfigStore.setSecret. */
const CREDENTIAL_SETTING_KEYS: ReadonlySet<SettingKey> = new Set([
  "spotify.clientId",
  "twitch.clientId",
  "youtube.clientId",
  "youtube.clientSecret",
  "streamerbot.password",
  "obs.password",
]);

/** Every key SettingKey (shared/types.ts) actually allows — mirrored here so settings:set can reject unknown keys from the renderer at runtime, since the SettingKey type itself is erased by then. */
const VALID_SETTING_KEYS: ReadonlySet<string> = new Set([
  "spotify.clientId",
  "windowsMedia.enabled",
  "twitch.clientId",
  "youtube.clientId",
  "youtube.clientSecret",
  "streamerbot.host",
  "streamerbot.port",
  "streamerbot.endpoint",
  "streamerbot.password",
  "obs.host",
  "obs.port",
  "obs.password",
  "overlay.host",
  "overlay.port",
  "customOverlays",
  "customOverlayFolders",
  "customLocales",
  "app.minimizeToTray",
] satisfies SettingKey[]);

/** Changing any of these should reconnect Streamer.bot with the new value immediately, same reasoning as windowsMedia.enabled's own stop/start below. */
const STREAMERBOT_RECONNECT_KEYS: ReadonlySet<SettingKey> = new Set([
  "streamerbot.host",
  "streamerbot.port",
  "streamerbot.endpoint",
  "streamerbot.password",
]);

/** Same reasoning as STREAMERBOT_RECONNECT_KEYS above, for OBS's own host/port/password. */
const OBS_RECONNECT_KEYS: ReadonlySet<SettingKey> = new Set([
  "obs.host",
  "obs.port",
  "obs.password",
]);

export function registerSettingsHandlers(deps: SettingsHandlersDeps): void {
  const {
    config,
    credentials,
    mainWindow,
    windowsMedia,
    streamerbot,
    obs,
    getStoredCanvasConfig,
    canvasConfigSettingKey,
    onMinimizeToTrayChanged,
  } = deps;

  let systemFontsCache: Promise<string[]> | null = null;
  ipcMain.handle("fonts:getSystem", (): Promise<string[]> => {
    systemFontsCache ??= getFonts({ disableQuoting: true }).catch(() => []);
    return systemFontsCache;
  });

  ipcMain.handle("app:getVersion", (): string => app.getVersion());

  ipcMain.handle("app:openExternal", (_event, url: string): void => {
    if (!/^https:\/\//.test(url)) return;
    void shell.openExternal(url);
  });

  ipcMain.handle("canvas:getConfig", (): CanvasConfig =>
    getStoredCanvasConfig(),
  );

  ipcMain.handle(
    "canvas:setConfig",
    (_event, value: CanvasConfig): CanvasConfig => {
      const normalized = normalizeCanvasConfig(value);
      config().setSetting(canvasConfigSettingKey, normalized);
      return normalized;
    },
  );

  ipcMain.handle("settings:get", (_event, key: SettingKey) =>
    CREDENTIAL_SETTING_KEYS.has(key)
      ? credentials().getClientId(key)
      : config().getSetting(key, null),
  );

  ipcMain.handle("settings:set", (_event, key: SettingKey, value: unknown) => {
    if (!VALID_SETTING_KEYS.has(key)) return;
    if (CREDENTIAL_SETTING_KEYS.has(key)) {
      credentials().setClientId(key, value as string);
    } else {
      config().setSetting(key, value);
    }
    if (key === "windowsMedia.enabled") {
      windowsMedia().stop();
      void windowsMedia().start();
    }
    if (STREAMERBOT_RECONNECT_KEYS.has(key)) {
      streamerbot().stop();
      void streamerbot().start();
    }
    if (OBS_RECONNECT_KEYS.has(key)) {
      obs().stop();
      void obs().start();
    }
    if (key === "app.minimizeToTray") {
      onMinimizeToTrayChanged(Boolean(value));
    }
  });

  ipcMain.handle(
    "window:setTitleBarOverlay",
    (_event, overlay: { color: string; symbolColor: string }) => {
      mainWindow()?.setTitleBarOverlay({ ...overlay, height: 36 });
    },
  );
}
