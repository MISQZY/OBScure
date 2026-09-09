import { BrowserWindow, ipcMain } from "electron";
import type { CustomOverlay } from "../shared/types";

export interface AudioCaptureOptions {
  preloadPath: string;
  /** Set when running against the Vite dev server (ELECTRON_RENDERER_URL) — same shape main/index.ts's own createMainWindow branches on. */
  rendererUrl?: string;
  /** Built renderer's index.html path — used instead of `rendererUrl` in a packaged/production build. */
  rendererFile?: string;
  onLevels: (deviceId: string, bands: number[]) => void;
}

let captureWindow: BrowserWindow | null = null;
let lastDeviceIds: string[] = [];

/**
 * Creates the hidden, permanently-alive window that does the actual
 * getUserMedia/AnalyserNode capture — deliberately NOT the main editor
 * window, which can be destroyed at any time (minimized to tray — see
 * createMainWindow's own "minimize" handler in main/index.ts) while the
 * overlay server and an OBS Browser Source keep right on running. Loaded
 * from the exact same origin as the main window (same renderer bundle, just
 * a different hash route — see pages/AudioCaptureRoute.tsx) so
 * enumerateDevices()'s device ids — salted per (session, origin), not per
 * window — resolve identically whether picked in the Scene Builder's own
 * Audio Source node or opened here for real capture.
 */
export function initAudioCapture(options: AudioCaptureOptions): void {
  ipcMain.on("audioCapture:levels", (_event, payload: { deviceId: string; bands: number[] }) => {
    options.onLevels(payload.deviceId, payload.bands);
  });

  captureWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: options.preloadPath,
    },
  });

  captureWindow.webContents.once("did-finish-load", () => {
    captureWindow?.webContents.send("audioCapture:setDevices", lastDeviceIds);
  });

  const hash = "/audio-capture";
  if (options.rendererUrl) {
    void captureWindow.loadURL(`${options.rendererUrl}#${hash}`);
  } else if (options.rendererFile) {
    void captureWindow.loadFile(options.rendererFile, { hash });
  }

  captureWindow.on("closed", () => {
    captureWindow = null;
  });
}

/** Every distinct `deviceId` an audioSource node names, across every saved custom overlay — the set of devices the hidden capture window should actually keep a live AnalyserNode open for. A device referenced by a scene that never shows still counts (same "always polling regardless of visibility" convention Now Playing's own integrations already use), keeping this simple rather than tracking which scene is currently live. */
function extractDeviceIds(overlays: CustomOverlay[]): string[] {
  const ids = new Set<string>();
  for (const overlay of overlays) {
    for (const node of overlay.nodes) {
      if (node.type !== "audioSource") continue;
      const deviceId = (node.data as Record<string, unknown> | undefined)?.deviceId;
      // An "obs:"-prefixed key (see AudioSourceNode.tsx's own OBS mode) isn't
      // a real local capture device at all — its levels come from
      // ObsIntegration reading OBS's own audio meters directly, never from
      // this hidden window's getUserMedia. Attempting to open it here would
      // just be a doomed capture call on every sync.
      if (typeof deviceId === "string" && deviceId && !deviceId.startsWith("obs:")) ids.add(deviceId);
    }
  }
  return [...ids];
}

/** Called on every scene save/delete (see OverlayServer's own `onCustomOverlaysChanged`) — tells the capture window which devices to open/close. Skips sending when the resolved set hasn't actually changed, so an unrelated field edit on some other node doesn't restart every open capture stream. */
export function syncAudioCaptureDevices(overlays: CustomOverlay[]): void {
  const deviceIds = extractDeviceIds(overlays);
  const unchanged = deviceIds.length === lastDeviceIds.length && deviceIds.every((id) => lastDeviceIds.includes(id));
  lastDeviceIds = deviceIds;
  if (unchanged) return;
  captureWindow?.webContents.send("audioCapture:setDevices", deviceIds);
}

export function stopAudioCapture(): void {
  captureWindow?.destroy();
  captureWindow = null;
}
