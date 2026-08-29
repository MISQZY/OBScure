import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { existsSync, mkdirSync, renameSync, unlinkSync, copyFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { execFile } from 'node:child_process'
import { getFonts } from 'font-list'
import { eventBus } from './eventBus'
import { OverlayServer } from './overlayServer'
import { ConfigStore } from './configStore'
import { ProfileManager } from './profileStore'
import { buildAppShellCsp } from './csp'
import { NowPlayingCache } from './nowPlayingCache'
import { SpotifyIntegration } from './integrations/spotify'
import { WindowsMediaIntegration } from './integrations/windowsMedia'
import { TwitchIntegration } from './integrations/twitch'
import { YoutubeIntegration } from './integrations/youtube'
import type {
  ConnectResult,
  CustomOverlay,
  IntegrationKey,
  IntegrationsStatusMap,
  NowPlayingPayload,
  OverlayAddress,
  OverlayUrls,
  RandomStatePayload,
  RouletteStatePayload,
  SettingKey,
  TwitchChannelStats,
  TwitchCustomReward
} from '../shared/types'
import type { CustomLocalePack, CustomThemePack } from '../shared/customConfig'
import {
  DEFAULT_EVENTS_CONFIGS,
  MAX_ROULETTE_DURATION_SECONDS,
  MIN_ROULETTE_DURATION_SECONDS,
  normalizeRandomConfig,
  normalizeRouletteConfig,
  type EventsConfigs,
  type EventTarget,
  type RandomConfig,
  type RouletteConfig
} from '../shared/eventsConfig'
import { DEFAULT_CANVAS_CONFIG, normalizeCanvasConfig, type CanvasConfig } from '../shared/canvasConfig'
import type { AvatarColor, Profile } from '../shared/profiles'
import { RandomEngine, RouletteEngine } from './eventsEngine'

// Without this, two copies of the app can end up running against the SAME
// profile at once (electron-vite's auto-relaunch on a main-process file
// change is enough of a window for this — the old process doesn't always
// exit before the new one starts). Each independently calls
// TwitchIntegration.start() with the SAME stored refresh token; Twitch
// rotates refresh tokens on every use, so whichever request lands second
// gets rejected outright (the token it sent was already invalidated by the
// first). That losing instance is now stuck — ConfigStore loads secrets
// once at construction and never re-reads the file, so its retries keep
// resending the same dead token — and if it ever persists any OTHER
// setting afterward, it flushes its whole stale in-memory config back to
// disk, clobbering the good refresh token the winning instance saved. The
// NEXT real restart then loads that dead token and Twitch rejects it,
// which is what actually shows up as "Twitch drops on restart" — the
// original connection was fine, a leftover second process quietly poisoned
// the saved token. Must be requested before any other app.* / ConfigStore
// setup below. app.quit() alone is NOT enough here: it only schedules a
// quit and doesn't stop the rest of this script from running synchronously,
// so without the hard exit the losing instance still falls through into
// building ConfigStore/integrations and still gets a 'ready' event — i.e.
// it still calls TwitchIntegration.start() and does the exact damage
// described above. process.exit() halts it before any of that happens.
if (!app.requestSingleInstanceLock()) {
  console.error('[main] lost single-instance lock, another instance is already running — exiting without touching config')
  process.exit(0)
}
app.on('second-instance', () => {
  console.error('[main] a second instance tried to start while this one is running')
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// The app was rebranded from MAddoner to OBScure, which changes Electron's
// default userData path (derived from package.json's productName). Without
// this, everyone who installed under the old name would silently "lose"
// their profiles/settings/OAuth tokens on first launch post-rebrand — the
// old folder isn't deleted, just orphaned, since Electron starts fresh at
// the new path. One-time move on first launch after the rename avoids that.
const oldUserDataDir = join(app.getPath('appData'), 'MAddoner')
const newUserDataDir = app.getPath('userData')
if (oldUserDataDir !== newUserDataDir && existsSync(oldUserDataDir) && !existsSync(newUserDataDir)) {
  renameSync(oldUserDataDir, newUserDataDir)
}

const DEFAULT_OVERLAY_HOST = '127.0.0.1'
const DEFAULT_OVERLAY_PORT = 47890

const EVENTS_CONFIG_SETTING_KEYS: Record<EventTarget, string> = {
  random: 'events.random.config',
  roulette: 'events.roulette.config'
}

const CANVAS_CONFIG_SETTING_KEY = 'canvas.config'

// In dev, out/main/index.js sits two levels below the project root's overlays/.
// In a packaged app, electron-builder copies overlays/ into resources/ instead
// (see extraResources in electron-builder.yml).
const overlaysDir = app.isPackaged
  ? join(process.resourcesPath, 'overlays')
  : join(__dirname, '../../overlays')

// Unlike overlaysDir (app resources, read-only once packaged), user-uploaded
// custom alert sounds need a writable location — userData persists across
// updates and is where ConfigStore already keeps its own data.
const customSoundsDir = join(app.getPath('userData'), 'custom-sounds')
if (!existsSync(customSoundsDir)) mkdirSync(customSoundsDir, { recursive: true })

const ALLOWED_SOUND_EXTENSIONS = ['.mp3', '.wav', '.ogg']

// Same idea as customSoundsDir, for Scene Builder's Image node — shared
// across all profiles (not per-profile), same convention as custom sounds.
const customImagesDir = join(app.getPath('userData'), 'custom-images')
if (!existsSync(customImagesDir)) mkdirSync(customImagesDir, { recursive: true })

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

const profileManager = new ProfileManager(app.getPath('userData'))
// Reassigned by reinitializeForActiveProfile() on profile switch/delete — every
// helper below reads `config` at call time, so a reassignment here is picked
// up everywhere without those callers needing to change.
let config = new ConfigStore(profileManager.getActiveProfileDir())

function getStoredCanvasConfig(): CanvasConfig {
  const stored = config.getSetting(CANVAS_CONFIG_SETTING_KEY, DEFAULT_CANVAS_CONFIG)
  return normalizeCanvasConfig(stored)
}

function getStoredRandomConfig(): RandomConfig {
  const stored = config.getSetting(EVENTS_CONFIG_SETTING_KEYS.random, DEFAULT_EVENTS_CONFIGS.random)
  return normalizeRandomConfig(stored)
}

function getStoredRouletteConfig(): RouletteConfig {
  const stored = config.getSetting(EVENTS_CONFIG_SETTING_KEYS.roulette, DEFAULT_EVENTS_CONFIGS.roulette)
  return normalizeRouletteConfig(stored)
}

function getStoredCustomOverlays(): CustomOverlay[] {
  return config.getSetting<CustomOverlay[]>('customOverlays', [])
}

function getStoredCustomThemes(): CustomThemePack[] {
  return config.getSetting<CustomThemePack[]>('customThemes', [])
}

function getStoredCustomLocales(): CustomLocalePack[] {
  return config.getSetting<CustomLocalePack[]>('customLocales', [])
}

const overlayServer = new OverlayServer({
  host: config.getSetting('overlay.host', DEFAULT_OVERLAY_HOST),
  port: config.getSetting('overlay.port', DEFAULT_OVERLAY_PORT),
  eventBus,
  overlaysDir,
  customSoundsDir,
  customImagesDir,
  initialCustomOverlays: getStoredCustomOverlays()
})

// Reassigned by reinitializeForActiveProfile() — each integration is built
// from (and holds a reference to) `config`, so a profile switch needs fresh
// instances bound to the new profile's ConfigStore rather than a live hot-swap.
let integrations = {
  spotify: new SpotifyIntegration('spotify', eventBus, config),
  windowsMedia: new WindowsMediaIntegration('windowsMedia', eventBus, config),
  twitch: new TwitchIntegration('twitch', eventBus, config),
  youtube: new YoutubeIntegration('youtube', eventBus, config)
}

// Unlike `config`/`integrations`, OverlayServer stays alive across a profile
// switch — it registers its eventBus subscriptions once in its constructor
// (see overlayServer.ts) specifically to avoid duplicate listeners piling up
// if it were ever recreated. A profile switch instead pushes the new
// profile's custom overlays into it — see reinitializeForActiveProfile.
// randomEngine/rouletteEngine are internal tools with no overlay of their
// own (see pages/tools/*) and are stateless besides an in-memory round that
// isn't worth tearing down mid-switch, so they're never recreated either.
const randomEngine = new RandomEngine(eventBus)
const rouletteEngine = new RouletteEngine(eventBus)

/**
 * Gate for roulette's entryMode ('all' | 'followers' | 'subscribers') —
 * shared by both entry sources below. Neither status is known for free, so
 * 'followers'/'subscribers' always cost one Helix lookup (see
 * TwitchIntegration.isFollower/isSubscriber); reads `integrations` at call
 * time, same as getStoredRouletteConfig, so it stays correct across a
 * profile switch.
 */
async function isEligibleForRoulette(mode: RouletteConfig['entryMode'], userId: string): Promise<boolean> {
  if (mode === 'all') return true
  if (!userId) return false
  return mode === 'followers' ? integrations.twitch.isFollower(userId) : integrations.twitch.isSubscriber(userId)
}

// Chat/points entries are matched against the roulette's CURRENT saved config
// on every message/redemption (not captured once at round start), so an
// in-flight round always uses whatever command/reward is configured right now.
eventBus.on('chat-message', (payload) => {
  const config = getStoredRouletteConfig()
  const command = config.command.trim().toLowerCase()
  if (!command) return
  const text = payload.text.trim().toLowerCase()
  if (text !== command && !text.startsWith(`${command} `)) return
  void isEligibleForRoulette(config.entryMode, payload.userId).then((eligible) => {
    if (eligible) rouletteEngine.addEntrant(payload.user, 'chat')
  })
})

eventBus.on('points-redemption', (payload) => {
  const config = getStoredRouletteConfig()
  if (!config.pointsRewardId || payload.rewardId !== config.pointsRewardId) return
  void isEligibleForRoulette(config.entryMode, payload.userId).then((eligible) => {
    if (eligible) rouletteEngine.addEntrant(payload.user, 'points')
  })
})

// Pushed to the Roulette tool page so it reflects entrants and phase changes live.
eventBus.on('roulette-state', (state) => {
  mainWindow?.webContents.send('roulette:state', state)
})

// Latest track per source, kept for the dashboard's "Now playing" card — the
// pollers only emit 'now-playing' on change, so a fresh dashboard mount needs
// something to read via nowPlaying:get rather than waiting for the next change.
const nowPlayingRaw: Partial<Record<NowPlayingPayload['source'], NowPlayingPayload>> = {}

/** Spotify wins over Windows Media whenever both are connected — see nowPlayingRaw. */
function getEffectiveNowPlaying(): NowPlayingPayload | null {
  if (integrations.spotify.getStatus() === 'connected' && nowPlayingRaw.spotify) {
    return nowPlayingRaw.spotify
  }
  if (integrations.windowsMedia.getStatus() === 'connected' && nowPlayingRaw.windows) {
    return nowPlayingRaw.windows
  }
  return null
}

// Disk-backed cache (title/artist/status .txt files + a locally re-served
// cover) for whichever payload getEffectiveNowPlaying() currently picks —
// see NowPlayingCache. Kept alongside nowPlayingRaw rather than replacing it:
// this one only ever sees the winning source, so it can't confuse a Spotify
// cover with a Windows Media track if both happen to update in the same tick.
// The callback pushes a follow-up update once a cover that missed the
// initial resolve() (see its doc comment) finishes downloading.
const nowPlayingFileCache = new NowPlayingCache(app.getPath('userData'), (payload) => {
  mainWindow?.webContents.send('now-playing:update', payload)
})

// Pushed to the dashboard's "Now playing" card so it updates live.
eventBus.on('now-playing', (payload) => {
  nowPlayingRaw[payload.source] = payload
  const effective = getEffectiveNowPlaying()
  mainWindow?.webContents.send('now-playing:update', effective ? nowPlayingFileCache.resolve(effective) : null)
})

// Pushed to the renderer so the dashboard/settings pages immediately show connection status changes
eventBus.on('integration-status', () => {
  mainWindow?.webContents.send('integrations:status-update', {
    spotify: integrations.spotify.getStatus(),
    windowsMedia: integrations.windowsMedia.getStatus(),
    twitch: integrations.twitch.getStatus(),
    youtube: integrations.youtube.getStatus()
  })
})

/**
 * Backs profile switch/create-and-switch/delete-active: tears down and
 * rebuilds every subsystem tied to the active profile's directory in place,
 * instead of the app.relaunch()+app.exit() restart used before. Keeps
 * OverlayServer itself alive throughout (see the comment above
 * randomEngine/rouletteEngine) so OBS's Browser Sources don't need to
 * reconnect unless the new profile's host/port actually differ.
 */
async function reinitializeForActiveProfile(): Promise<void> {
  Object.values(integrations).forEach((integration) => integration.stop())
  delete nowPlayingRaw.spotify
  delete nowPlayingRaw.windows
  nowPlayingFileCache.reset()

  config = new ConfigStore(profileManager.getActiveProfileDir())

  integrations = {
    spotify: new SpotifyIntegration('spotify', eventBus, config),
    windowsMedia: new WindowsMediaIntegration('windowsMedia', eventBus, config),
    twitch: new TwitchIntegration('twitch', eventBus, config),
    youtube: new YoutubeIntegration('youtube', eventBus, config)
  }
  await Promise.all(Object.values(integrations).map((integration) => integration.start()))

  const host = config.getSetting('overlay.host', DEFAULT_OVERLAY_HOST)
  const port = config.getSetting('overlay.port', DEFAULT_OVERLAY_PORT)
  const currentUrls = overlayServer.getOverlayUrls()
  if (currentUrls.host !== host || currentUrls.port !== port) {
    await overlayServer.restart({ host, port })
  }

  overlayServer.setCustomOverlays(getStoredCustomOverlays())

  // Full reload rather than an IPC event: every renderer provider/page fetches
  // its own state over IPC on mount, so this is the simplest way to guarantee
  // nothing renders stale data left over from the previous profile.
  mainWindow?.webContents.reload()
}

let mainWindow: BrowserWindow | null = null

const DWMWA_TRANSITIONS_FORCEDISABLED = 3

/**
 * Disables Windows' own maximize/restore/minimize transition ANIMATION for
 * this specific window via a DWM window attribute. Not exposed by Electron's
 * API, so this shells out to a one-off, hidden PowerShell process that makes
 * the single DwmSetWindowAttribute P/Invoke call — avoids pulling in a
 * native (node-gyp-compiled) addon for one small, best-effort cosmetic fix.
 *
 * Why this exists: the window itself (this process) resizes synchronously
 * with the OS, but during an OS-*animated* transition (clicking maximize,
 * double-clicking the titlebar, Aero Snap, Win+Up/Down) DWM briefly
 * stretches the window's PREVIOUS frame to the new bounds as a placeholder
 * while Chromium's separate renderer process catches up — visible as the
 * whole UI (titlebar buttons, sidebar, content) doubling/ghosting for a
 * couple of frames. That's distinct from (and unaffected by) `backgroundColor`
 * below, which only covers newly-exposed *unpainted* surface during a plain
 * drag-resize, not DWM replaying old, already-painted content. Disabling the
 * animation removes the stretched intermediate frame entirely — the window
 * just snaps to its new bounds, same as a live drag-resize already does.
 */
function disableWindowTransitionAnimations(win: BrowserWindow): void {
  if (process.platform !== 'win32') return
  const hwnd = win.getNativeWindowHandle().readBigUInt64LE(0)
  const script = `Add-Type -Namespace N -Name Dwm -MemberDefinition '[DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);'; $v = 1; [N.Dwm]::DwmSetWindowAttribute([IntPtr]${hwnd}, ${DWMWA_TRANSITIONS_FORCEDISABLED}, [ref]$v, 4) | Out-Null`
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
    { windowsHide: true },
    (error) => {
      if (error) console.error('Failed to disable window transition animations:', error)
    }
  )
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    show: false,
    icon,
    // `frame: false` (an earlier approach) drops the ENTIRE native frame,
    // including DWM's own resize handling — the renderer then has to catch
    // up to the new bounds asynchronously over IPC on every resize tick,
    // which caused the titlebar/sidebar lag while live-resizing.
    // `titleBarStyle: 'hidden'` keeps the real frame (so Windows/DWM still
    // owns resize/move) but hides its default titlebar content.
    titleBarStyle: 'hidden',
    // Per Electron's own custom-titlebar guidance (docs/tutorial/custom-title-bar):
    // on Windows/Linux, `titleBarStyle: 'hidden'` alone gives you NO window
    // controls at all — you're expected to opt back in via `titleBarOverlay`.
    // That's not just cosmetic: these buttons are then drawn by DWM itself as
    // part of the real native frame, not by our own React/Chromium content —
    // so, unlike a custom HTML button, they physically cannot lag behind the
    // window's actual bounds during a resize; there's no renderer-process
    // repaint in their path at all. Colors match the app's dark theme
    // (--sidebar / --muted-foreground, see index.css) since we can't read the
    // persisted theme choice from the main process (renderer-side
    // localStorage) at window-creation time.
    titleBarOverlay: {
      color: '#171717',
      symbolColor: '#a3a3a3',
      height: 36
    },
    // The native window (this process) resizes synchronously with the OS, but
    // the page content is repainted by a separate renderer process over IPC —
    // that hop can lag a frame or more behind during a fast live-resize,
    // briefly exposing raw, unpainted window surface at the newly-revealed
    // edge (Chromium's default clear color there, not our theme). Matching
    // this to the app's actual dark-theme background makes that gap
    // invisible instead of showing as a stray flash/seam. Hardcoded rather
    // than read from the persisted theme choice (renderer-side localStorage,
    // not visible to the main process at window-creation time) — dark is
    // this app's default and by far the common case.
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
    }
  })

  disableWindowTransitionAnimations(mainWindow)

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    // The Vite dev server can still be finishing its startup when Electron's
    // first load attempt fires; retry a few times instead of failing silently.
    mainWindow.webContents.on('did-fail-load', () => {
      setTimeout(() => mainWindow?.loadURL(rendererUrl), 300)
    })
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // Only the app shell's own top-level document gets this CSP — the overlay
  // pages are separate documents (loaded in an iframe for live preview, or by
  // OBS/a browser directly outside this session) and must keep their own
  // inline <script>, which this policy doesn't allow.
  //
  // Skipped entirely in dev (no file:// load, ELECTRON_RENDERER_URL set instead):
  // @vitejs/plugin-react injects an inline <script> "preamble" for Fast Refresh
  // that a strict script-src 'self' blocks outright, which blanks the whole app.
  // The Vite dev server is already a fully trusted local tool, so there's
  // nothing this CSP would meaningfully be hardening there anyway.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isAppShell = details.resourceType === 'mainFrame' && details.url.startsWith('file://')

    if (!isAppShell) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    const { host, port } = overlayServer.getOverlayUrls()
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildAppShellCsp(host, port)]
      }
    })
  })

  await overlayServer.start()
  await Promise.all(Object.values(integrations).map((integration) => integration.start()))

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  overlayServer.stop()
  Object.values(integrations).forEach((integration) => integration.stop())
})

ipcMain.handle('overlay:getUrls', (): OverlayUrls => overlayServer.getOverlayUrls())

ipcMain.handle('overlay:updateAddress', async (_event, address: OverlayAddress): Promise<OverlayUrls> => {
  await overlayServer.restart(address)
  config.setSetting('overlay.host', address.host)
  config.setSetting('overlay.port', address.port)
  return overlayServer.getOverlayUrls()
})

function registerCustomPackHandlers<T extends { id: string }>(
  getKey: string,
  saveKey: string,
  deleteKey: string,
  settingKey: SettingKey,
  getter: () => T[],
  onSet?: (next: T[]) => void
) {
  ipcMain.handle(getKey, (): T[] => getter())
  ipcMain.handle(saveKey, (_event, item: T): T[] => {
    const current = getter()
    const exists = current.some((i) => i.id === item.id)
    const next = exists ? current.map((i) => (i.id === item.id ? item : i)) : [...current, item]
    config.setSetting(settingKey, next)
    if (onSet) onSet(next)
    return next
  })
  ipcMain.handle(deleteKey, (_event, id: string): T[] => {
    const next = getter().filter((i) => i.id !== id)
    config.setSetting(settingKey, next)
    if (onSet) onSet(next)
    return next
  })
}

registerCustomPackHandlers('overlay:getCustomOverlays', 'overlay:saveCustomOverlay', 'overlay:deleteCustomOverlay', 'customOverlays', getStoredCustomOverlays, (next) => overlayServer.setCustomOverlays(next as CustomOverlay[]))
registerCustomPackHandlers('theme:getCustomThemes', 'theme:saveCustomTheme', 'theme:deleteCustomTheme', 'customThemes', getStoredCustomThemes)
registerCustomPackHandlers('locale:getCustomLocales', 'locale:saveCustomLocale', 'locale:deleteCustomLocale', 'customLocales', getStoredCustomLocales)

/** Live-previews a scene (possibly with unsaved edits) in any connected Browser Source — see OverlayServer.testCustomOverlay. Not persisted; Save still owns that. */
ipcMain.handle('overlay:testCustomOverlay', (_event, overlay: CustomOverlay) => {
  overlayServer.testCustomOverlay(overlay)
})

ipcMain.handle('config:openJsonFile', async (): Promise<{ fileName: string; content: string } | null> => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON config', extensions: ['json'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  const content = await readFile(filePath, 'utf-8')
  return { fileName: basename(filePath), content }
})

ipcMain.handle('config:saveTextFile', async (_event, defaultFileName: string, content: string): Promise<boolean> => {
  if (!mainWindow) return false

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultFileName,
    filters: [{ name: 'JSON config', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return false

  await writeFile(result.filePath, content, 'utf-8')
  return true
})

// Enumerating system fonts shells out (registry on Windows, fc-list on Linux,
// CoreText on macOS) — cached after the first call since the installed font
// set never changes while the app is running, and the font picker may be
// opened repeatedly.
let systemFontsCache: Promise<string[]> | null = null
ipcMain.handle('fonts:getSystem', (): Promise<string[]> => {
  systemFontsCache ??= getFonts({ disableQuoting: true }).catch(() => [])
  return systemFontsCache
})

ipcMain.handle('app:getVersion', (): string => app.getVersion())

ipcMain.handle('canvas:getConfig', (): CanvasConfig => getStoredCanvasConfig())

ipcMain.handle('canvas:setConfig', (_event, value: CanvasConfig): CanvasConfig => {
  const normalized = normalizeCanvasConfig(value)
  config.setSetting(CANVAS_CONFIG_SETTING_KEY, normalized)
  return normalized
})

async function handleMediaUpload(
  mainWindow: BrowserWindow | null,
  filters: { name: string; extensions: string[] }[],
  allowedExtensions: string[],
  destDir: string,
  previousFileName: string | null
) {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters })
  if (result.canceled || result.filePaths.length === 0) return null

  const sourcePath = result.filePaths[0]
  const ext = extname(sourcePath).toLowerCase()
  if (!allowedExtensions.includes(ext)) return null

  const fileName = `${randomUUID()}${ext}`
  copyFileSync(sourcePath, join(destDir, fileName))

  if (previousFileName) {
    const previousPath = join(destDir, basename(previousFileName))
    if (existsSync(previousPath)) {
      try { unlinkSync(previousPath) } catch { /* ignore */ }
    }
  }

  return { fileName }
}

function handleMediaRemove(destDir: string, fileName: string) {
  const filePath = join(destDir, basename(fileName))
  if (existsSync(filePath)) {
    try { unlinkSync(filePath) } catch { /* ignore */ }
  }
}

ipcMain.handle('sounds:uploadCustom', (_event, previousFileName: string | null) => 
  handleMediaUpload(mainWindow, [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }], ALLOWED_SOUND_EXTENSIONS, customSoundsDir, previousFileName)
)
ipcMain.handle('sounds:removeCustom', (_event, fileName: string) => handleMediaRemove(customSoundsDir, fileName))

ipcMain.handle('images:uploadCustom', (_event, previousFileName: string | null) => 
  handleMediaUpload(mainWindow, [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }], ALLOWED_IMAGE_EXTENSIONS, customImagesDir, previousFileName)
)
ipcMain.handle('images:removeCustom', (_event, fileName: string) => handleMediaRemove(customImagesDir, fileName))

ipcMain.handle('integrations:status', (): IntegrationsStatusMap => ({
  spotify: integrations.spotify.getStatus(),
  windowsMedia: integrations.windowsMedia.getStatus(),
  twitch: integrations.twitch.getStatus(),
  youtube: integrations.youtube.getStatus()
}))

ipcMain.handle('settings:get', (_event, key: SettingKey) => config.getSetting(key, null))

ipcMain.handle('settings:set', (_event, key: SettingKey, value: unknown) => {
  config.setSetting(key, value)
  // Unlike Twitch/YouTube/Spotify (toggled live via integrations:connect/disconnect),
  // Windows Media has no OAuth step — its only control is this plain settings toggle,
  // so flipping it here must (re)start or stop the poller itself, not just persist
  // the flag for the next app launch to pick up.
  if (key === 'windowsMedia.enabled') {
    integrations.windowsMedia.stop()
    void integrations.windowsMedia.start()
  }
})

// The window is created before the renderer has resolved a theme (main can't see
// the renderer's persisted preference at creation time — see the titleBarOverlay
// comment in createMainWindow), so it starts with a hardcoded guess. Once the
// renderer knows the real theme, it calls this to correct the native buttons'
// colors in place via DWM, same as any other titleBarOverlay update.
ipcMain.handle('window:setTitleBarOverlay', (_event, overlay: { color: string; symbolColor: string }) => {
  mainWindow?.setTitleBarOverlay({ ...overlay, height: 36 })
})

ipcMain.handle('profiles:list', (): Profile[] => profileManager.list())

ipcMain.handle('profiles:getActiveId', (): string => profileManager.getActiveId())

ipcMain.handle('profiles:create', (_event, name: string): Profile => profileManager.create(name))

ipcMain.handle('profiles:rename', (_event, id: string, name: string) => {
  profileManager.rename(id, name)
})

ipcMain.handle('profiles:setAvatarColor', (_event, id: string, color: AvatarColor) => {
  profileManager.setAvatarColor(id, color)
})

ipcMain.handle('profiles:delete', async (_event, id: string) => {
  const wasActive = profileManager.delete(id)
  if (wasActive) await reinitializeForActiveProfile()
})

ipcMain.handle('profiles:switch', async (_event, id: string) => {
  profileManager.setActive(id)
  await reinitializeForActiveProfile()
})

ipcMain.handle('events:getConfig', (_event, target: EventTarget): EventsConfigs[EventTarget] => {
  if (target === 'roulette') return getStoredRouletteConfig()
  return getStoredRandomConfig()
})

ipcMain.handle('events:setConfig', (_event, target: EventTarget, value: EventsConfigs[EventTarget]) => {
  const normalized = target === 'roulette' ? normalizeRouletteConfig(value) : normalizeRandomConfig(value)
  config.setSetting(EVENTS_CONFIG_SETTING_KEYS[target], normalized)
  return normalized
})

ipcMain.handle('events:random:commit', (_event, min: number, max: number, count: number): RandomStatePayload => {
  const lo = Math.trunc(Math.min(min, max))
  const hi = Math.trunc(Math.max(min, max))
  const maxCount = Math.min(10, Math.max(1, count))
  return randomEngine.commit(lo, hi > lo ? hi : lo + 1, maxCount)
})

ipcMain.handle('events:random:reveal', (): RandomStatePayload => randomEngine.reveal())

ipcMain.handle('events:roulette:start', (_event, durationSeconds: number): RouletteStatePayload => {
  const seconds = Math.trunc(durationSeconds)
  const clamped = Math.min(MAX_ROULETTE_DURATION_SECONDS, Math.max(MIN_ROULETTE_DURATION_SECONDS, seconds))
  return rouletteEngine.start(seconds > 0 ? clamped : DEFAULT_EVENTS_CONFIGS.roulette.durationSeconds)
})

ipcMain.handle('events:roulette:addEntrant', (_event, name: string): RouletteStatePayload =>
  rouletteEngine.addEntrant(name, 'manual')
)

ipcMain.handle('events:roulette:removeEntrant', (_event, id: string): RouletteStatePayload =>
  rouletteEngine.removeEntrant(id)
)

ipcMain.handle('events:roulette:cancel', (): RouletteStatePayload => rouletteEngine.cancel())

ipcMain.handle('events:roulette:finishEarly', (): RouletteStatePayload => rouletteEngine.finishEarly())

ipcMain.handle('events:roulette:getState', (): RouletteStatePayload => rouletteEngine.getState())

ipcMain.handle('integrations:twitch:getRewards', async (): Promise<TwitchCustomReward[]> => {
  try {
    return await integrations.twitch.getCustomRewards()
  } catch {
    return []
  }
})

ipcMain.handle('integrations:twitch:getStats', async (): Promise<TwitchChannelStats | null> => {
  try {
    return await integrations.twitch.getChannelStats()
  } catch {
    return null
  }
})

ipcMain.handle('nowPlaying:get', (): NowPlayingPayload | null => {
  const effective = getEffectiveNowPlaying()
  return effective ? nowPlayingFileCache.resolve(effective) : null
})

ipcMain.handle('integrations:connect', async (_event, key: IntegrationKey): Promise<ConnectResult> => {
  try {
    await integrations[key].connect()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('integrations:disconnect', async (_event, key: IntegrationKey) => {
  await integrations[key].disconnect()
})
