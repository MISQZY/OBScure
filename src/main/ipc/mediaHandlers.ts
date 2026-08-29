import { dialog, ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { existsSync, copyFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, extname, join } from "node:path";

interface MediaHandlersDeps {
  mainWindow: () => BrowserWindow | null;
  customSoundsDir: string;
  customImagesDir: string;
  allowedSoundExtensions: string[];
  allowedImageExtensions: string[];
}

async function handleMediaUpload(
  mainWindow: BrowserWindow | null,
  filters: { name: string; extensions: string[] }[],
  allowedExtensions: string[],
  destDir: string,
  previousFileName: string | null,
) {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters,
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const sourcePath = result.filePaths[0];
  const ext = extname(sourcePath).toLowerCase();
  if (!allowedExtensions.includes(ext)) return null;

  const fileName = `${randomUUID()}${ext}`;
  copyFileSync(sourcePath, join(destDir, fileName));

  if (previousFileName) {
    const previousPath = join(destDir, basename(previousFileName));
    if (existsSync(previousPath)) {
      try {
        unlinkSync(previousPath);
      } catch {
        /* ignore */
      }
    }
  }

  return { fileName };
}

function handleMediaRemove(destDir: string, fileName: string) {
  const filePath = join(destDir, basename(fileName));
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }
}

export function registerMediaHandlers(deps: MediaHandlersDeps): void {
  const {
    mainWindow,
    customSoundsDir,
    customImagesDir,
    allowedSoundExtensions,
    allowedImageExtensions,
  } = deps;

  ipcMain.handle(
    "sounds:uploadCustom",
    (_event, previousFileName: string | null) =>
      handleMediaUpload(
        mainWindow(),
        [{ name: "Audio", extensions: ["mp3", "wav", "ogg"] }],
        allowedSoundExtensions,
        customSoundsDir,
        previousFileName,
      ),
  );
  ipcMain.handle("sounds:removeCustom", (_event, fileName: string) =>
    handleMediaRemove(customSoundsDir, fileName),
  );

  ipcMain.handle(
    "images:uploadCustom",
    (_event, previousFileName: string | null) =>
      handleMediaUpload(
        mainWindow(),
        [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
        allowedImageExtensions,
        customImagesDir,
        previousFileName,
      ),
  );
  ipcMain.handle("images:removeCustom", (_event, fileName: string) =>
    handleMediaRemove(customImagesDir, fileName),
  );
}
