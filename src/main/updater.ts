import { app, ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { AppUpdaterStatus } from "../shared/types";

/**
 * electron-updater's NSIS auto-update relies on install metadata that only
 * exists when the app was installed via the NSIS setup — a portable exe has
 * no uninstall registry entry for it to update in place, so the feature is
 * disabled there. electron-builder's portable launcher sets this env var.
 */
function isPortableBuild(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

export function initUpdater(getMainWindow: () => BrowserWindow | null): void {
  let status: AppUpdaterStatus = { state: "idle" };

  function setStatus(next: AppUpdaterStatus): void {
    status = next;
    getMainWindow()?.webContents.send("updater:status", status);
  }

  ipcMain.handle("updater:getStatus", (): AppUpdaterStatus => status);

  if (!app.isPackaged || isPortableBuild()) {
    status = { state: "unsupported" };
    ipcMain.handle("updater:download", async (): Promise<void> => {});
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => setStatus({ state: "checking" }));
  autoUpdater.on("update-not-available", () => setStatus({ state: "not-available" }));
  autoUpdater.on("update-available", (info) =>
    setStatus({ state: "available", version: info.version }),
  );
  autoUpdater.on("download-progress", (progress) =>
    setStatus({ state: "downloading", percent: Math.round(progress.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) => {
    setStatus({ state: "downloaded", version: info.version });
    autoUpdater.quitAndInstall(true, true);
  });
  autoUpdater.on("error", (error) =>
    setStatus({ state: "error", message: error.message }),
  );

  ipcMain.handle("updater:download", async (): Promise<void> => {
    if (status.state !== "available") return;
    await autoUpdater.downloadUpdate();
  });

  void autoUpdater
    .checkForUpdates()
    .catch((error: Error) => setStatus({ state: "error", message: error.message }));
}
