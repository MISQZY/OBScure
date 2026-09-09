import { app, BrowserWindow, Menu, Tray, session } from "electron";
import type { Rectangle } from "electron";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import icon from "../../resources/icon.png?asset";
import { execFile } from "node:child_process";
import { eventBus } from "./eventBus";
import { OverlayServer } from "./overlayServer";
import { initAudioCapture, syncAudioCaptureDevices, stopAudioCapture } from "./audioCapture";
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
import { StreamerBotIntegration } from "./integrations/streamerbot";
import { ObsIntegration } from "./integrations/obs";
import { RandomEngine, RouletteEngine } from "./eventsEngine";
import { ActionQueueEngine } from "./actionQueueEngine";
import { EventLog } from "./eventLog";
import { registerOverlayHandlers } from "./ipc/overlayHandlers";
import { registerEventLogHandlers } from "./ipc/eventLogHandlers";
import { registerMediaHandlers } from "./ipc/mediaHandlers";
import { registerSettingsHandlers } from "./ipc/settingsHandlers";
import { registerEventsHandlers } from "./ipc/eventsHandlers";
import { registerActionsHandlers } from "./ipc/actionsHandlers";
import { registerCommandsHandlers } from "./ipc/commandsHandlers";
import { registerProfileHandlers } from "./ipc/profileHandlers";
import { registerIntegrationsHandlers } from "./ipc/integrationsHandlers";
import { initUpdater } from "./updater";
import { initWhatsNew } from "./whatsNew";
import { initLogger, logError, logInfo, logWarn } from "./logger";
import type { GlobalVariable, NowPlayingPayload } from "../shared/types";
import type { CustomLocalePack } from "../shared/customConfig";
import {
  DEFAULT_ACTION_QUEUES,
  DEFAULT_COMMANDS,
  DEFAULT_EVENTS_CONFIGS,
  matchesChatCommand,
  normalizeActionConfigs,
  normalizeActionQueueConfigs,
  normalizeCommandDefs,
  normalizeRandomConfig,
  normalizeRouletteConfig,
  type ActionConfig,
  type ActionQueueConfig,
  type CommandDef,
  type CommandEntryType,
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

// Diagnostic only — Chromium already restarts a crashed GPU process on its
// own (falling back to software rendering after enough repeated crashes).
// Logged so a renderer crash reported elsewhere (see "render-process-gone"
// handlers below) can be correlated with a GPU crash that preceded it.
app.on("child-process-gone", (_event, details) => {
  if (details.type !== "GPU") return;
  logWarn("main", `GPU process gone (${details.reason}, exitCode=${details.exitCode})`);
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
const ACTIONS_SETTING_KEY = "actions.list";
const ACTION_QUEUES_SETTING_KEY = "actionQueues.list";
const COMMANDS_SETTING_KEY = "commands.list";

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

function getStoredActions(): ActionConfig[] {
  return normalizeActionConfigs(config.getSetting(ACTIONS_SETTING_KEY, []));
}

function getStoredActionQueues(): ActionQueueConfig[] {
  return normalizeActionQueueConfigs(
    config.getSetting(ACTION_QUEUES_SETTING_KEY, DEFAULT_ACTION_QUEUES),
  );
}

function getStoredCommands(): CommandDef[] {
  return normalizeCommandDefs(
    config.getSetting(COMMANDS_SETTING_KEY, DEFAULT_COMMANDS),
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
  onCustomOverlaysChanged: (overlays) => syncAudioCaptureDevices(overlays),
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
  streamerbot: new StreamerBotIntegration(
    "streamerbot",
    eventBus,
    config,
    credentialsStore,
  ),
  obs: new ObsIntegration(
    "obs",
    eventBus,
    config,
    credentialsStore,
    (key, bands) => overlayServer.pushAudioLevels(key, bands),
  ),
};

const randomEngine = new RandomEngine(eventBus);
const rouletteEngine = new RouletteEngine(eventBus);
const actionQueueEngine = new ActionQueueEngine(eventBus, overlayServer);
actionQueueEngine.setQueues(getStoredActionQueues());
const eventLog = new EventLog(eventBus, (entry) => {
  mainWindow?.webContents.send("eventLog:entry", entry);
});

/** A viewer is eligible if `entryTypes` is empty (no restriction) or they belong to any one of the selected groups (OR, not AND — picking both Followers and Subscribers widens eligibility rather than narrowing it). */
async function isEligibleForCommand(
  entryTypes: CommandEntryType[],
  userId: string,
): Promise<boolean> {
  if (entryTypes.length === 0) return true;
  if (!userId) return false;
  const results = await Promise.all(
    entryTypes.map((type) =>
      type === "followers"
        ? integrations.twitch.isFollower(userId)
        : integrations.twitch.isSubscriber(userId),
    ),
  );
  return results.some(Boolean);
}

eventBus.on("chat-message", (payload) => {
  const commands = getStoredCommands();
  const findCommand = (id: string | null): CommandDef | null =>
    id ? (commands.find((c) => c.id === id) ?? null) : null;

  // Broadcast for EVERY registered command a match hits, independent of
  // whether Roulette/an Action also happens to reference it — this is what
  // a Scene's own Event(kind: 'command') node reacts to (see
  // CommandTriggeredPayload's own doc comment), same "registered once, used
  // anywhere" model the Commands page exists for.
  for (const command of commands) {
    if (!matchesChatCommand(payload.text, command)) continue;
    void isEligibleForCommand(command.entryTypes, payload.userId)
      .then((eligible) => {
        if (eligible) eventBus.emit("command-triggered", { commandId: command.id, user: payload.user });
      })
      .catch((error) => {
        logError("main", "command eligibility check failed for chat entry", error);
      });
  }

  const rouletteCommand = findCommand(getStoredRouletteConfig().commandId);
  if (rouletteCommand && matchesChatCommand(payload.text, rouletteCommand)) {
    void isEligibleForCommand(rouletteCommand.entryTypes, payload.userId)
      .then((eligible) => {
        if (eligible) rouletteEngine.addEntrant(payload.user, "chat");
      })
      .catch((error) => {
        logError("main", "roulette eligibility check failed for chat entry", error);
      });
  }

  for (const action of getStoredActions()) {
    const command = findCommand(action.commandId);
    if (!command || !matchesChatCommand(payload.text, command)) continue;
    void isEligibleForCommand(command.entryTypes, payload.userId)
      .then((eligible) => {
        if (eligible) actionQueueEngine.enqueue(action);
      })
      .catch((error) => {
        logError("main", "action eligibility check failed for chat entry", error);
      });
  }
});

eventBus.on("points-redemption", (payload) => {
  const cfg = getStoredRouletteConfig();
  if (!cfg.pointsRewardId || payload.rewardId !== cfg.pointsRewardId) return;
  const rouletteCommand = cfg.commandId
    ? getStoredCommands().find((c) => c.id === cfg.commandId)
    : undefined;
  void isEligibleForCommand(rouletteCommand?.entryTypes ?? [], payload.userId)
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

eventBus.on("action-queues-state", (state) => {
  mainWindow?.webContents.send("actionQueues:state", state);
});

eventBus.on("streamerbot-trigger", (payload) => {
  for (const action of getStoredActions()) {
    if (!action.streamerbotEnabled) continue;
    if (action.streamerbotTriggerType === "command") {
      if (payload.kind !== "command") continue;
      const commandName = action.streamerbotCommandName.trim().toLowerCase();
      if (!commandName || (payload.command ?? "").toLowerCase() !== commandName) {
        continue;
      }
      actionQueueEngine.enqueue(action);
      continue;
    }
    if (payload.kind !== "customEvent") continue;
    const eventName = action.streamerbotEventName.trim();
    if (!eventName || payload.eventName !== eventName) continue;
    actionQueueEngine.enqueue(action);
  }
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

eventBus.on("streamerbot-globals", (variables) => {
  mainWindow?.webContents.send("streamerbot-globals:update", variables);
  overlayServer.setStreamerBotGlobals(variables);
});

eventBus.on("integration-status", () => {
  mainWindow?.webContents.send("integrations:status-update", {
    spotify: integrations.spotify.getStatus(),
    windowsMedia: integrations.windowsMedia.getStatus(),
    twitch: integrations.twitch.getStatus(),
    youtube: integrations.youtube.getStatus(),
    streamerbot: integrations.streamerbot.getStatus(),
    obs: integrations.obs.getStatus(),
  });
});

async function reinitializeForActiveProfile(): Promise<void> {
  Object.values(integrations).forEach((integration) => integration.stop());
  delete nowPlayingRaw.spotify;
  delete nowPlayingRaw.windows;
  nowPlayingFileCache.reset();
  overlayServer.pushNowPlaying(null);
  overlayServer.pushTwitchStats(null);
  overlayServer.setStreamerBotGlobals([]);

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
    streamerbot: new StreamerBotIntegration(
      "streamerbot",
      eventBus,
      config,
      credentialsStore,
    ),
    obs: new ObsIntegration(
      "obs",
      eventBus,
      config,
      credentialsStore,
      (key, bands) => overlayServer.pushAudioLevels(key, bands),
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
  actionQueueEngine.reset();
  actionQueueEngine.setQueues(getStoredActionQueues());
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

  // A renderer crash (GPU context loss, OOM, ...) leaves the BrowserWindow
  // itself alive but showing nothing forever unless something reloads it —
  // Electron doesn't do this on its own. "clean-exit" only happens on a
  // deliberate destroy() (see the app quitting/"minimize" handler above),
  // never something to recover from.
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logError("main", `main window renderer process gone (${details.reason}, exitCode=${details.exitCode})`);
    if (details.reason === "clean-exit") return;
    setTimeout(() => mainWindow?.reload(), 300);
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
  streamerbot: () => integrations.streamerbot,
  obs: () => integrations.obs,
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

registerActionsHandlers({
  config: () => config,
  actionQueueEngine,
  actionsSettingKey: ACTIONS_SETTING_KEY,
  actionQueuesSettingKey: ACTION_QUEUES_SETTING_KEY,
  getStoredActions,
  getStoredActionQueues,
});

registerCommandsHandlers({
  config: () => config,
  commandsSettingKey: COMMANDS_SETTING_KEY,
  getStoredCommands,
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

registerEventLogHandlers({ eventLog });

app.whenReady().then(async () => {
  // Every window this app ever creates loads only its own local content
  // (the renderer bundle and, via a separate HTTP server, the overlay
  // pages — see overlayServer.ts) — never a remote/untrusted origin — so
  // granting every permission request here just restores Electron's own
  // default-allow behavior for everything EXCEPT media capture, which
  // Electron denies outright unless a handler explicitly grants it. This is
  // what lets the Equalizer feature's Audio Source node (enumerateDevices
  // labels) and the hidden capture window (getUserMedia) both work with no
  // permission-prompt UI to click through — there wouldn't be anywhere to
  // show one for the offscreen capture window anyway.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(true));
  session.defaultSession.setPermissionCheckHandler(() => true);

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

  initAudioCapture({
    preloadPath: join(__dirname, "../preload/index.js"),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFile: join(__dirname, "../renderer/index.html"),
    onLevels: (deviceId, bands) => overlayServer.pushAudioLevels(deviceId, bands),
  });

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
  stopAudioCapture();
  overlayServer.stop();
  Object.values(integrations).forEach((integration) => integration.stop());
});
