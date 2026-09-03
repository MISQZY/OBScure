import { app, BrowserWindow, Menu, Tray, session } from "electron";
import type { Rectangle } from "electron";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import icon from "../../resources/icon.png?asset";
import { execFile } from "node:child_process";
import { eventBus } from "./eventBus";
import { OverlayServer } from "./overlayServer";
import { ConfigStore } from "./configStore";
import { ProfileManager } from "./profileStore";
import { OverlayStore } from "./overlayStore";
import { ThemeStore } from "./themeStore";
import { CredentialsStore } from "./credentialsStore";
import { runAllMigrations } from "./migrations";
import { buildAppShellCsp } from "./csp";
import { NowPlayingCache } from "./nowPlayingCache";
import { SpotifyIntegration } from "./integrations/spotify";
import { WindowsMediaIntegration } from "./integrations/windowsMedia";
import { TwitchIntegration } from "./integrations/twitch";
import { YoutubeIntegration } from "./integrations/youtube";
import { RandomEngine, RouletteEngine } from "./eventsEngine";
import { registerOverlayHandlers } from "./ipc/overlayHandlers";
import { registerMediaHandlers } from "./ipc/mediaHandlers";
import { registerSettingsHandlers } from "./ipc/settingsHandlers";
import { registerEventsHandlers } from "./ipc/eventsHandlers";
import { registerProfileHandlers } from "./ipc/profileHandlers";
import { registerIntegrationsHandlers } from "./ipc/integrationsHandlers";
import { initUpdater } from "./updater";
import { initWhatsNew } from "./whatsNew";
import { initLogger, logError, logInfo, logWarn } from "./logger";
import type { GlobalVariable, NowPlayingPayload } from "../shared/types";
import type { CustomLocalePack } from "../shared/customConfig";
import {
  DEFAULT_EVENTS_CONFIGS,
  normalizeRandomConfig,
  normalizeRouletteConfig,
  type EventTarget,
  type RandomConfig,
  type RouletteConfig,
} from "../shared/eventsConfig";
import {
  DEFAULT_CANVAS_CONFIG,
  normalizeCanvasConfig,
  type CanvasConfig,
} from "../shared/canvasConfig";

initLogger();
logInfo("main", `Starting OBScure v${app.getVersion()} (${process.platform})`);

process.on("uncaughtException", (error) => {
  logError("main", "uncaught exception", error);
});
process.on("unhandledRejection", (reason) => {
  logError("main", "unhandled promise rejection", reason);
});

if (!app.requestSingleInstanceLock()) {
  process.exit(0);
}

app.on("second-instance", () => {
  showMainWindow();
});

const oldUserDataDir = join(app.getPath("appData"), "MAddoner");
const newUserDataDir = app.getPath("userData");
if (
  oldUserDataDir !== newUserDataDir &&
  existsSync(oldUserDataDir) &&
  !existsSync(newUserDataDir)
) {
  renameSync(oldUserDataDir, newUserDataDir);
}

const DEFAULT_OVERLAY_HOST = "127.0.0.1";
const DEFAULT_OVERLAY_PORT = 47890;

const EVENTS_CONFIG_SETTING_KEYS: Record<EventTarget, string> = {
  random: "events.random.config",
  roulette: "events.roulette.config",
};

const CANVAS_CONFIG_SETTING_KEY = "canvas.config";

const overlaysDir = app.isPackaged
  ? join(process.resourcesPath, "overlays")
  : join(__dirname, "../../overlays");

const customSoundsDir = join(app.getPath("userData"), "custom-sounds");
if (!existsSync(customSoundsDir))
  mkdirSync(customSoundsDir, { recursive: true });

const customImagesDir = join(app.getPath("userData"), "custom-images");
if (!existsSync(customImagesDir))
  mkdirSync(customImagesDir, { recursive: true });

const profileManager = new ProfileManager(app.getPath("userData"));
runAllMigrations(app.getPath("userData"));
let config = new ConfigStore(profileManager.getActiveProfileDir());
let overlayStore = new OverlayStore(profileManager.getActiveProfileDir());
let credentialsStore = new CredentialsStore(profileManager.getActiveProfileDir());
const themeStore = new ThemeStore(app.getPath("userData"));

function getStoredCanvasConfig(): CanvasConfig {
  return normalizeCanvasConfig(
    config.getSetting(CANVAS_CONFIG_SETTING_KEY, DEFAULT_CANVAS_CONFIG),
  );
}

function getStoredRandomConfig(): RandomConfig {
  return normalizeRandomConfig(
    config.getSetting(
      EVENTS_CONFIG_SETTING_KEYS.random,
      DEFAULT_EVENTS_CONFIGS.random,
    ),
  );
}

function getStoredRouletteConfig(): RouletteConfig {
  return normalizeRouletteConfig(
    config.getSetting(
      EVENTS_CONFIG_SETTING_KEYS.roulette,
      DEFAULT_EVENTS_CONFIGS.roulette,
    ),
  );
}

function getStoredCustomLocales(): CustomLocalePack[] {
  return config.getSetting<CustomLocalePack[]>("customLocales", []);
}

function getStoredGlobalVariables(): GlobalVariable[] {
  return config.getSetting<GlobalVariable[]>("globalVariables", []);
}

const overlayServer = new OverlayServer({
  host: config.getSetting("overlay.host", DEFAULT_OVERLAY_HOST),
  port: config.getSetting("overlay.port", DEFAULT_OVERLAY_PORT),
  eventBus,
  overlaysDir,
  customSoundsDir,
  customImagesDir,
  initialCustomOverlays: overlayStore.listOverlays(),
  initialGlobalVariables: getStoredGlobalVariables(),
});


let integrations = {
  spotify: new SpotifyIntegration("spotify", eventBus, config, credentialsStore),
  windowsMedia: new WindowsMediaIntegration(
    "windowsMedia",
    eventBus,
    config,
    credentialsStore,
  ),
  twitch: new TwitchIntegration("twitch", eventBus, config, credentialsStore),
  youtube: new YoutubeIntegration("youtube", eventBus, config, credentialsStore),
};

const randomEngine = new RandomEngine(eventBus);
const rouletteEngine = new RouletteEngine(eventBus);

async function isEligibleForRoulette(
  mode: RouletteConfig["entryMode"],
  userId: string,
): Promise<boolean> {
  if (mode === "all") return true;
  if (!userId) return false;
  return mode === "followers"
    ? integrations.twitch.isFollower(userId)
    : integrations.twitch.isSubscriber(userId);
}

eventBus.on("chat-message", (payload) => {
  const cfg = getStoredRouletteConfig();
  const command = cfg.command.trim().toLowerCase();
  if (!command) return;
  const text = payload.text.trim().toLowerCase();
  if (text !== command && !text.startsWith(`${command} `)) return;
  void isEligibleForRoulette(cfg.entryMode, payload.userId)
    .then((eligible) => {
      if (eligible) rouletteEngine.addEntrant(payload.user, "chat");
    })
    .catch((error) => {
      logError("main", "roulette eligibility check failed for chat entry", error);
    });
});

eventBus.on("points-redemption", (payload) => {
  const cfg = getStoredRouletteConfig();
  if (!cfg.pointsRewardId || payload.rewardId !== cfg.pointsRewardId) return;
  void isEligibleForRoulette(cfg.entryMode, payload.userId)
    .then((eligible) => {
      if (eligible) rouletteEngine.addEntrant(payload.user, "points");
    })
    .catch((error) => {
      logError("main", "roulette eligibility check failed for points redemption", error);
    });
});

eventBus.on("roulette-state", (state) => {
  mainWindow?.webContents.send("roulette:state", state);
});

const nowPlayingRaw: Partial<
  Record<NowPlayingPayload["source"], NowPlayingPayload>
> = {};

function getEffectiveNowPlaying(): NowPlayingPayload | null {
  if (integrations.spotify.getStatus() === "connected" && nowPlayingRaw.spotify)
    return nowPlayingRaw.spotify;
  if (
    integrations.windowsMedia.getStatus() === "connected" &&
    nowPlayingRaw.windows
  )
    return nowPlayingRaw.windows;
  return null;
}

const nowPlayingFileCache = new NowPlayingCache(
  app.getPath("userData"),
  (payload) => {
    mainWindow?.webContents.send("now-playing:update", payload);
    overlayServer.pushNowPlaying(payload);
  },
);

eventBus.on("now-playing", (payload) => {
  nowPlayingRaw[payload.source] = payload;
  const effective = getEffectiveNowPlaying();
  const resolved = effective ? nowPlayingFileCache.resolve(effective) : null;
  mainWindow?.webContents.send("now-playing:update", resolved);
  overlayServer.pushNowPlaying(resolved);
});

eventBus.on("twitch-stats", (stats) => {
  mainWindow?.webContents.send("twitch-stats:update", stats);
  overlayServer.pushTwitchStats(stats);
});

eventBus.on("integration-status", () => {
  mainWindow?.webContents.send("integrations:status-update", {
    spotify: integrations.spotify.getStatus(),
    windowsMedia: integrations.windowsMedia.getStatus(),
    twitch: integrations.twitch.getStatus(),
    youtube: integrations.youtube.getStatus(),
  });
});

async function reinitializeForActiveProfile(): Promise<void> {
  Object.values(integrations).forEach((integration) => integration.stop());
  delete nowPlayingRaw.spotify;
  delete nowPlayingRaw.windows;
  nowPlayingFileCache.reset();
  overlayServer.pushNowPlaying(null);
  overlayServer.pushTwitchStats(null);

  const profileDir = profileManager.getActiveProfileDir();
  config = new ConfigStore(profileDir);
  overlayStore = new OverlayStore(profileDir);
  credentialsStore = new CredentialsStore(profileDir);

  integrations = {
    spotify: new SpotifyIntegration("spotify", eventBus, config, credentialsStore),
    windowsMedia: new WindowsMediaIntegration(
      "windowsMedia",
      eventBus,
      config,
      credentialsStore,
    ),
    twitch: new TwitchIntegration("twitch", eventBus, config, credentialsStore),
    youtube: new YoutubeIntegration(
      "youtube",
      eventBus,
      config,
      credentialsStore,
    ),
  };
  await Promise.all(
    Object.values(integrations).map((integration) => integration.start()),
  );

  const host = config.getSetting("overlay.host", DEFAULT_OVERLAY_HOST);
  const port = config.getSetting("overlay.port", DEFAULT_OVERLAY_PORT);
  const currentUrls = overlayServer.getOverlayUrls();
  if (currentUrls.host !== host || currentUrls.port !== port) {
    await overlayServer.restart({ host, port });
  }

  overlayServer.setCustomOverlays(overlayStore.listOverlays());
  overlayServer.setGlobalVariables(getStoredGlobalVariables());
  mainWindow?.webContents.reload();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Remembers size/position/maximized state across a minimize-to-tray
// destroy+recreate cycle (see the "minimize" handler in createMainWindow) —
// a destroyed BrowserWindow has no persistent identity of its own, so
// without this every reopen would snap back to the hardcoded default size
// instead of wherever the user last had it. `savedWindowBounds` only ever
// reflects the *normal* (non-maximized) rect — updated while not maximized —
// since capturing bounds while maximized would poison it with the
// full-screen size, and unmaximizing later would then restore to that
// instead of the user's real pre-maximize size.
let savedWindowBounds: Rectangle | null = null;
let savedWindowMaximized = false;

function minimizeToTrayEnabled(): boolean {
  return config.getSetting("app.minimizeToTray", false);
}

const TRAY_MENU_TEXT = app.getLocale().startsWith("ru")
  ? { open: "Открыть OBScure", quit: "Выход" }
  : { open: "Open OBScure", quit: "Quit" };

/**
 * Created lazily the first time the window is minimized/closed to tray, then
 * kept alive for the rest of the process — recreating a Tray icon on every
 * hide/show cycle causes it to flicker in the Windows notification area.
 */
function createTray(): void {
  if (tray) return;
  tray = new Tray(icon);
  tray.setToolTip("OBScure");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: TRAY_MENU_TEXT.open, click: () => showMainWindow() },
      { type: "separator" },
      { label: TRAY_MENU_TEXT.quit, click: () => app.quit() },
    ]),
  );
  tray.on("click", () => showMainWindow());
}

function showMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
}

const DWMWA_TRANSITIONS_FORCEDISABLED = 3;

function disableWindowTransitionAnimations(win: BrowserWindow): void {
  if (process.platform !== "win32") return;
  const hwnd = win.getNativeWindowHandle().readBigUInt64LE(0);
  const script = `Add-Type -Namespace N -Name Dwm -MemberDefinition '[DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);'; $v = 1; [N.Dwm]::DwmSetWindowAttribute([IntPtr]${hwnd}, ${DWMWA_TRANSITIONS_FORCEDISABLED}, [ref]$v, 4) | Out-Null`;
  execFile(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-Command",
      script,
    ],
    { windowsHide: true },
    (error) => {
      if (error) logWarn("main", "failed to disable window transition animations", error);
    },
  );
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    ...(savedWindowBounds ?? { width: 960, height: 640 }),
    show: false,
    icon,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#171717", symbolColor: "#a3a3a3", height: 36 },
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
    },
  });

  disableWindowTransitionAnimations(mainWindow);
  mainWindow.on("ready-to-show", () => {
    // Maximize before show so the window doesn't flash at its normal size first.
    if (savedWindowMaximized) mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.on("resize", () => {
    if (!mainWindow || mainWindow.isMaximized()) return;
    savedWindowBounds = mainWindow.getBounds();
  });
  mainWindow.on("move", () => {
    if (!mainWindow || mainWindow.isMaximized()) return;
    savedWindowBounds = mainWindow.getBounds();
  });
  mainWindow.on("maximize", () => {
    savedWindowMaximized = true;
  });
  mainWindow.on("unmaximize", () => {
    savedWindowMaximized = false;
  });

  // Electron's "minimize" event fires after the OS has already minimized the
  // window and isn't cancelable (no event.preventDefault() — unlike "close"),
  // so this reacts to it rather than intercepting it: immediately closing the
  // window right behind the OS's own minimize fully tears down the renderer
  // instead of just hiding it. With the window gone, only the overlay
  // HTTP/WS server and the integrations that feed it keep doing work in the
  // background, instead of a hidden-but-alive renderer still holding its JS
  // heap/GPU surface and (throttled) timers.
  mainWindow.on("minimize", () => {
    if (!minimizeToTrayEnabled()) return;
    createTray();
    mainWindow?.close();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    mainWindow.webContents.on("did-fail-load", () => {
      setTimeout(() => mainWindow?.loadURL(rendererUrl), 300);
    });
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

registerOverlayHandlers({
  config: () => config,
  overlayStore: () => overlayStore,
  themeStore,
  overlayServer,
  mainWindow: () => mainWindow,
  getStoredCustomLocales,
  getStoredGlobalVariables,
});

registerMediaHandlers({
  mainWindow: () => mainWindow,
  customSoundsDir,
  customImagesDir,
  allowedSoundExtensions: [".mp3", ".wav", ".ogg"],
  allowedImageExtensions: [".png", ".jpg", ".jpeg", ".gif", ".webp"],
});

registerSettingsHandlers({
  config: () => config,
  credentials: () => credentialsStore,
  mainWindow: () => mainWindow,
  windowsMedia: () => integrations.windowsMedia,
  getStoredCanvasConfig,
  canvasConfigSettingKey: CANVAS_CONFIG_SETTING_KEY,
  onMinimizeToTrayChanged: (enabled) => {
    if (!enabled) {
      tray?.destroy();
      tray = null;
    }
  },
});

registerEventsHandlers({
  config: () => config,
  randomEngine,
  rouletteEngine,
  eventsConfigSettingKeys: EVENTS_CONFIG_SETTING_KEYS,
  getStoredRandomConfig,
  getStoredRouletteConfig,
});

registerProfileHandlers({
  profileManager,
  reinitializeForActiveProfile,
});

registerIntegrationsHandlers({
  integrations: () => integrations,
  getEffectiveNowPlaying,
  nowPlayingFileCache,
});

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isAppShell =
      details.resourceType === "mainFrame" && details.url.startsWith("file://");

    if (!isAppShell) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const { host, port } = overlayServer.getOverlayUrls();
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [buildAppShellCsp(host, port)],
      },
    });
  });

  await overlayServer.start();
  await Promise.all(
    Object.values(integrations).map((integration) => integration.start()),
  );

  createMainWindow();
  initUpdater(() => mainWindow);
  initWhatsNew(config, app.getVersion());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) showMainWindow();
  });
});

app.on("window-all-closed", () => {
  // Minimize-to-tray destroys the window (see the "minimize" handler in
  // createMainWindow) to actually free the renderer's memory/CPU rather than
  // just hiding it, which also means it goes through this same event as a
  // real close. When that setting is on, treat "no windows" as "living in
  // the tray" instead of quitting — the overlay server and integrations
  // that feed it keep running in the main process regardless.
  if (minimizeToTrayEnabled()) {
    createTray();
    return;
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  tray?.destroy();
  tray = null;
  overlayServer.stop();
  Object.values(integrations).forEach((integration) => integration.stop());
});
