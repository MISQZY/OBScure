import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ConfigStore } from "../configStore";
import type { OverlayStore } from "../overlayStore";
import type { ThemeStore } from "../themeStore";
import type { OverlayServer } from "../overlayServer";
import type {
  CustomOverlay,
  GlobalVariable,
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
  overlayStore: () => OverlayStore;
  themeStore: ThemeStore;
  overlayServer: OverlayServer;
  mainWindow: () => BrowserWindow | null;
  getStoredCustomLocales: () => CustomLocalePack[];
  getStoredGlobalVariables: () => GlobalVariable[];
}

export function registerOverlayHandlers(deps: OverlayHandlersDeps): void {
  const {
    config,
    overlayStore,
    themeStore,
    overlayServer,
    mainWindow,
    getStoredCustomLocales,
    getStoredGlobalVariables,
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

  // ---------------------------------------------------------------------------
  // Custom overlays — per-file storage via OverlayStore
  // ---------------------------------------------------------------------------

  ipcMain.handle(
    "overlay:getCustomOverlays",
    (): CustomOverlay[] => overlayStore().listOverlays(),
  );

  ipcMain.handle(
    "overlay:saveCustomOverlay",
    (_event, overlay: CustomOverlay): CustomOverlay[] => {
      overlayStore().saveOverlay(overlay);
      const next = overlayStore().listOverlays();
      overlayServer.setCustomOverlays(next);
      return next;
    },
  );

  ipcMain.handle(
    "overlay:deleteCustomOverlay",
    (_event, id: string): CustomOverlay[] => {
      overlayStore().deleteOverlay(id);
      const next = overlayStore().listOverlays();
      overlayServer.setCustomOverlays(next);
      return next;
    },
  );

  // ---------------------------------------------------------------------------
  // Overlay folders — stored in overlays/folders.json via OverlayStore
  // ---------------------------------------------------------------------------

  ipcMain.handle(
    "overlay:getCustomOverlayFolders",
    (): OverlayFolder[] => overlayStore().listFolders(),
  );

  ipcMain.handle(
    "overlay:saveCustomOverlayFolder",
    (_event, folder: OverlayFolder): OverlayFolder[] => {
      const current = overlayStore().listFolders();
      const exists = current.some((f) => f.id === folder.id);
      const next = exists
        ? current.map((f) => (f.id === folder.id ? folder : f))
        : [...current, folder];
      overlayStore().saveFolders(next);
      return next;
    },
  );

  ipcMain.handle(
    "overlay:deleteCustomOverlayFolder",
    (_event, id: string): OverlayFolder[] => {
      const folders = overlayStore().listFolders();
      const next = folders.filter((f) => f.id !== id);
      overlayStore().saveFolders(next);

      // Deleting a folder only ungroups its scenes — it never deletes them.
      const overlays = overlayStore().listOverlays();
      const affected = overlays.filter((o) => o.folderId === id);
      if (affected.length > 0) {
        for (const o of affected) {
          overlayStore().saveOverlay({ ...o, folderId: undefined });
        }
        overlayServer.setCustomOverlays(overlayStore().listOverlays());
      }
      return next;
    },
  );

  // ---------------------------------------------------------------------------
  // Themes — per-file storage via ThemeStore (userData/themes/, not profile-scoped)
  // ---------------------------------------------------------------------------

  ipcMain.handle(
    "theme:getCustomThemes",
    (): CustomThemePack[] => themeStore.listThemes(),
  );

  ipcMain.handle(
    "theme:saveCustomTheme",
    (_event, theme: CustomThemePack): CustomThemePack[] => {
      themeStore.saveTheme(theme);
      return themeStore.listThemes();
    },
  );

  ipcMain.handle(
    "theme:deleteCustomTheme",
    (_event, id: string): CustomThemePack[] => {
      themeStore.deleteTheme(id);
      return themeStore.listThemes();
    },
  );

  // ---------------------------------------------------------------------------
  // Locales — still live in config.json (small, rarely change)
  // ---------------------------------------------------------------------------

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
    "locale:getCustomLocales",
    "locale:saveCustomLocale",
    "locale:deleteCustomLocale",
    "customLocales",
    getStoredCustomLocales,
  );

  // ---------------------------------------------------------------------------
  // Global variables — "Данные → Переменные" page. Persisted the same way
  // Locales are (a plain list in config.json); `onSet` additionally pushes
  // every change to OverlayServer so an already-open OBS Browser Source picks
  // it up live (see OverlayServer.setGlobalVariables' own doc comment).
  // ---------------------------------------------------------------------------

  registerCustomPackHandlers(
    "variables:getGlobal",
    "variables:saveGlobal",
    "variables:deleteGlobal",
    "globalVariables",
    getStoredGlobalVariables,
    (next) => overlayServer.setGlobalVariables(next),
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
