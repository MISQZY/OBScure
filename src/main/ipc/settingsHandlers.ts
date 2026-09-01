import { app, ipcMain, shell } from "electron";
import type { BrowserWindow } from "electron";
import { getFonts } from "font-list";
import type { ConfigStore } from "../configStore";
import type { CredentialsStore } from "../credentialsStore";
import type { WindowsMediaIntegration } from "../integrations/windowsMedia";
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
  getStoredCanvasConfig: () => CanvasConfig;
  canvasConfigSettingKey: string;
}

/** Client ID / client secret keys — persisted via CredentialsStore, not ConfigStore. */
const CREDENTIAL_SETTING_KEYS: ReadonlySet<SettingKey> = new Set([
  "spotify.clientId",
  "twitch.clientId",
  "youtube.clientId",
  "youtube.clientSecret",
]);

export function registerSettingsHandlers(deps: SettingsHandlersDeps): void {
  const {
    config,
    credentials,
    mainWindow,
    windowsMedia,
    getStoredCanvasConfig,
    canvasConfigSettingKey,
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
    if (CREDENTIAL_SETTING_KEYS.has(key)) {
      credentials().setClientId(key, value as string);
    } else {
      config().setSetting(key, value);
    }
    if (key === "windowsMedia.enabled") {
      windowsMedia().stop();
      void windowsMedia().start();
    }
  });

  ipcMain.handle(
    "window:setTitleBarOverlay",
    (_event, overlay: { color: string; symbolColor: string }) => {
      mainWindow()?.setTitleBarOverlay({ ...overlay, height: 36 });
    },
  );
}
