import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ConfigStore } from "../configStore";
import type { OverlayServer } from "../overlayServer";
import type {
  CustomOverlay,
  OverlayAddress,
  OverlayFolder,
  OverlayUrls,
  SettingKey,
} from "../../shared/types";
import type {
  CustomThemePack,
  CustomLocalePack,
} from "../../shared/customConfig";

interface OverlayHandlersDeps {
  config: () => ConfigStore;
  overlayServer: OverlayServer;
  mainWindow: () => BrowserWindow | null;
  getStoredCustomOverlays: () => CustomOverlay[];
  getStoredCustomOverlayFolders: () => OverlayFolder[];
  getStoredCustomThemes: () => CustomThemePack[];
  getStoredCustomLocales: () => CustomLocalePack[];
}

export function registerOverlayHandlers(deps: OverlayHandlersDeps): void {
  const {
    config,
    overlayServer,
    mainWindow,
    getStoredCustomOverlays,
    getStoredCustomOverlayFolders,
    getStoredCustomThemes,
    getStoredCustomLocales,
  } = deps;

  ipcMain.handle("overlay:getUrls", (): OverlayUrls =>
    overlayServer.getOverlayUrls(),
  );

  ipcMain.handle(
    "overlay:updateAddress",
    async (_event, address: OverlayAddress): Promise<OverlayUrls> => {
      await overlayServer.restart(address);
      config().setSetting("overlay.host", address.host);
      config().setSetting("overlay.port", address.port);
      return overlayServer.getOverlayUrls();
    },
  );

  function registerCustomPackHandlers<T extends { id: string }>(
    getKey: string,
    saveKey: string,
    deleteKey: string,
    settingKey: SettingKey,
    getter: () => T[],
    onSet?: (next: T[]) => void,
  ) {
    ipcMain.handle(getKey, (): T[] => getter());
    ipcMain.handle(saveKey, (_event, item: T): T[] => {
      const current = getter();
      const exists = current.some((i) => i.id === item.id);
      const next = exists
        ? current.map((i) => (i.id === item.id ? item : i))
        : [...current, item];
      config().setSetting(settingKey, next);
      if (onSet) onSet(next);
      return next;
    });
    ipcMain.handle(deleteKey, (_event, id: string): T[] => {
      const next = getter().filter((i) => i.id !== id);
      config().setSetting(settingKey, next);
      if (onSet) onSet(next);
      return next;
    });
  }

  registerCustomPackHandlers(
    "overlay:getCustomOverlays",
    "overlay:saveCustomOverlay",
    "overlay:deleteCustomOverlay",
    "customOverlays",
    getStoredCustomOverlays,
    (next) => overlayServer.setCustomOverlays(next as CustomOverlay[]),
  );

  ipcMain.handle(
    "overlay:getCustomOverlayFolders",
    (): OverlayFolder[] => getStoredCustomOverlayFolders(),
  );
  ipcMain.handle(
    "overlay:saveCustomOverlayFolder",
    (_event, folder: OverlayFolder): OverlayFolder[] => {
      const current = getStoredCustomOverlayFolders();
      const exists = current.some((f) => f.id === folder.id);
      const next = exists
        ? current.map((f) => (f.id === folder.id ? folder : f))
        : [...current, folder];
      config().setSetting("customOverlayFolders", next);
      return next;
    },
  );
  ipcMain.handle(
    "overlay:deleteCustomOverlayFolder",
    (_event, id: string): OverlayFolder[] => {
      const next = getStoredCustomOverlayFolders().filter((f) => f.id !== id);
      config().setSetting("customOverlayFolders", next);
      // Deleting a folder only ungroups its scenes — it never deletes them.
      const overlays = getStoredCustomOverlays();
      if (overlays.some((o) => o.folderId === id)) {
        const nextOverlays = overlays.map((o) =>
          o.folderId === id ? { ...o, folderId: undefined } : o,
        );
        config().setSetting("customOverlays", nextOverlays);
        overlayServer.setCustomOverlays(nextOverlays);
      }
      return next;
    },
  );
  registerCustomPackHandlers(
    "theme:getCustomThemes",
    "theme:saveCustomTheme",
    "theme:deleteCustomTheme",
    "customThemes",
    getStoredCustomThemes,
  );
  registerCustomPackHandlers(
    "locale:getCustomLocales",
    "locale:saveCustomLocale",
    "locale:deleteCustomLocale",
    "customLocales",
    getStoredCustomLocales,
  );

  ipcMain.handle(
    "overlay:testCustomOverlay",
    (_event, overlay: CustomOverlay) => {
      overlayServer.testCustomOverlay(overlay);
    },
  );

  ipcMain.handle(
    "config:openJsonFile",
    async (): Promise<{ fileName: string; content: string } | null> => {
      const win = mainWindow();
      if (!win) return null;
      const { dialog } = await import("electron");
      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: [{ name: "JSON config", extensions: ["json"] }],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const filePath = result.filePaths[0];
      const content = await readFile(filePath, "utf-8");
      return { fileName: basename(filePath), content };
    },
  );

  ipcMain.handle(
    "config:saveTextFile",
    async (
      _event,
      defaultFileName: string,
      content: string,
    ): Promise<boolean> => {
      const win = mainWindow();
      if (!win) return false;
      const { dialog } = await import("electron");
      const result = await dialog.showSaveDialog(win, {
        defaultPath: defaultFileName,
        filters: [{ name: "JSON config", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) return false;
      await writeFile(result.filePath, content, "utf-8");
      return true;
    },
  );
}
