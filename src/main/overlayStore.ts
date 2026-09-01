import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { CustomOverlay, OverlayFolder } from "../shared/types";

const FOLDERS_FILE = "folders.json";

/**
 * Persists CustomOverlay scenes as individual JSON files inside
 * `<profileDir>/overlays/<id>.json`, and OverlayFolder list as a single
 * `<profileDir>/overlays/folders.json`.
 */
export class OverlayStore {
  private readonly dir: string;
  private readonly foldersPath: string;

  constructor(profileDir: string) {
    this.dir = join(profileDir, "overlays");
    this.foldersPath = join(this.dir, FOLDERS_FILE);

    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private pathFor(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  // ---------------------------------------------------------------------------
  // Overlays (one file per overlay)
  // ---------------------------------------------------------------------------

  listOverlays(): CustomOverlay[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json") && f !== FOLDERS_FILE)
      .map((f) => {
        try {
          return JSON.parse(
            readFileSync(join(this.dir, f), "utf-8"),
          ) as CustomOverlay;
        } catch {
          return null;
        }
      })
      .filter((o): o is CustomOverlay => o !== null);
  }

  saveOverlay(overlay: CustomOverlay): void {
    writeFileSync(
      this.pathFor(overlay.id),
      JSON.stringify(overlay, null, 2),
      "utf-8",
    );
  }

  deleteOverlay(id: string): void {
    const p = this.pathFor(id);
    if (existsSync(p)) rmSync(p);
  }

  // ---------------------------------------------------------------------------
  // Folders (single file)
  // ---------------------------------------------------------------------------

  listFolders(): OverlayFolder[] {
    if (!existsSync(this.foldersPath)) return [];
    try {
      return JSON.parse(
        readFileSync(this.foldersPath, "utf-8"),
      ) as OverlayFolder[];
    } catch {
      return [];
    }
  }

  saveFolders(folders: OverlayFolder[]): void {
    writeFileSync(
      this.foldersPath,
      JSON.stringify(folders, null, 2),
      "utf-8",
    );
  }
}
