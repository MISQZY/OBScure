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
 *
 * On construction it auto-migrates legacy data that may still live in
 * `config.json` under the keys `customOverlays` / `customOverlayFolders`.
 */
export class OverlayStore {
  private readonly dir: string;
  private readonly foldersPath: string;

  constructor(profileDir: string, legacyConfigPath?: string) {
    this.dir = join(profileDir, "overlays");
    this.foldersPath = join(this.dir, FOLDERS_FILE);

    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });

    if (legacyConfigPath) this.migrateFromConfig(legacyConfigPath);
  }

  // ---------------------------------------------------------------------------
  // Migration
  // ---------------------------------------------------------------------------

  /**
   * One-shot migration: reads `customOverlays` / `customOverlayFolders` from
   * the legacy `config.json` and writes them into the new per-file layout.
   * Removes the migrated keys from `config.json` so the migration does not run
   * again on the next start.
   */
  private migrateFromConfig(configPath: string): void {
    if (!existsSync(configPath)) return;

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(readFileSync(configPath, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      return;
    }

    const overlays = raw["customOverlays"];
    const folders = raw["customOverlayFolders"];

    if (!Array.isArray(overlays) && !Array.isArray(folders)) return;

    // Write overlays only if they do not already exist on disk (so we never
    // clobber newer data with stale config.json content).
    if (Array.isArray(overlays)) {
      for (const overlay of overlays as CustomOverlay[]) {
        const dest = this.pathFor(overlay.id);
        if (!existsSync(dest)) {
          writeFileSync(dest, JSON.stringify(overlay, null, 2), "utf-8");
        }
      }
    }

    if (Array.isArray(folders) && !existsSync(this.foldersPath)) {
      writeFileSync(
        this.foldersPath,
        JSON.stringify(folders, null, 2),
        "utf-8",
      );
    }

    // Strip migrated keys from config.json so this branch never fires again.
    const { customOverlays: _co, customOverlayFolders: _cf, ...rest } = raw;
    writeFileSync(configPath, JSON.stringify(rest, null, 2), "utf-8");
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
