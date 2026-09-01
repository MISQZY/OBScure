import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { CustomOverlay } from "../shared/types";
import type { CustomThemePack } from "../shared/customConfig";
import { logInfo, logWarn } from "./logger";

/**
 * Runs all pending data migrations at startup.
 * Every migration is idempotent — safe to call on each launch.
 * Migrations strip their source keys from config.json on success,
 * so they never run again for an already-migrated profile.
 */
export function runAllMigrations(userDataDir: string): void {
  migrateOverlaysToPerFileStorage(userDataDir);
  migrateThemesToGlobalFolder(userDataDir);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Iterates every sub-directory of `<userData>/profiles/`. */
function eachProfileDir(
  userDataDir: string,
  cb: (profileDir: string, profileId: string) => void,
): void {
  const profilesRoot = join(userDataDir, "profiles");
  if (!existsSync(profilesRoot)) return;
  for (const entry of readdirSync(profilesRoot)) {
    const dir = join(profilesRoot, entry);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    cb(dir, entry);
  }
}

function readConfigJson(
  profileDir: string,
): Record<string, unknown> | null {
  const configPath = join(profileDir, "config.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

/** ConfigStore keeps every migratable key under the top-level `settings` object. */
function readSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const settings = raw["settings"];
  return settings && typeof settings === "object"
    ? (settings as Record<string, unknown>)
    : {};
}

function patchConfigJson(
  profileDir: string,
  raw: Record<string, unknown>,
  settings: Record<string, unknown>,
): void {
  const configPath = join(profileDir, "config.json");
  try {
    writeFileSync(
      configPath,
      JSON.stringify({ ...raw, settings }, null, 2),
      "utf-8",
    );
  } catch (e) {
    logWarn("migrations", `failed to patch config.json in ${profileDir}`, e);
  }
}

// ---------------------------------------------------------------------------
// Migration: overlays  (v1 → v2)
// ---------------------------------------------------------------------------

/**
 * Before: `<profileDir>/config.json`  →  `{ customOverlays: [...], customOverlayFolders: [...] }`
 * After:  `<profileDir>/overlays/<id>.json`  +  `<profileDir>/overlays/folders.json`
 *
 * Rationale: per-file layout avoids a single large JSON write on every save
 * and makes concurrent access from the overlay server safer.
 */
function migrateOverlaysToPerFileStorage(userDataDir: string): void {
  eachProfileDir(userDataDir, (profileDir, profileId) => {
    const raw = readConfigJson(profileDir);
    if (!raw) return;
    const settings = readSettings(raw);

    const overlays = settings["customOverlays"];
    const folders = settings["customOverlayFolders"];
    if (!Array.isArray(overlays) && !Array.isArray(folders)) return;

    const overlaysDir = join(profileDir, "overlays");
    if (!existsSync(overlaysDir)) mkdirSync(overlaysDir, { recursive: true });

    let count = 0;

    if (Array.isArray(overlays)) {
      for (const overlay of overlays as CustomOverlay[]) {
        const dest = join(overlaysDir, `${overlay.id}.json`);
        if (!existsSync(dest)) {
          try {
            writeFileSync(dest, JSON.stringify(overlay, null, 2), "utf-8");
            count++;
          } catch (e) {
            logWarn(
              "migrations",
              `overlays: failed to write ${overlay.id} (profile ${profileId})`,
              e,
            );
          }
        }
      }
    }

    const foldersPath = join(overlaysDir, "folders.json");
    if (Array.isArray(folders) && !existsSync(foldersPath)) {
      try {
        writeFileSync(foldersPath, JSON.stringify(folders, null, 2), "utf-8");
      } catch (e) {
        logWarn(
          "migrations",
          `overlays: failed to write folders (profile ${profileId})`,
          e,
        );
      }
    }

    // Strip migrated keys from config.json so this branch never fires again.
    const {
      customOverlays: _co,
      customOverlayFolders: _cf,
      ...restSettings
    } = settings;
    patchConfigJson(profileDir, raw, restSettings);

    if (count > 0) {
      logInfo(
        "migrations",
        `overlays: migrated ${count} scene(s) from profile ${profileId}`,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Migration: themes  (v2 → v3)
// ---------------------------------------------------------------------------

/**
 * Before: `<profileDir>/config.json`  →  `{ customThemes: [...] }`  (per-profile)
 * After:  `<userData>/themes/<id>.json`                               (global, shared)
 *
 * Rationale: custom themes are user-level preferences that make sense across
 * all profiles. Scans every profile so no themes are left behind even when
 * the user hasn't activated that profile since the update.
 */
function migrateThemesToGlobalFolder(userDataDir: string): void {
  const themesDir = join(userDataDir, "themes");
  let dirEnsured = false;

  eachProfileDir(userDataDir, (profileDir, profileId) => {
    const raw = readConfigJson(profileDir);
    if (!raw) return;
    const settings = readSettings(raw);

    const themes = settings["customThemes"];
    if (!Array.isArray(themes) || themes.length === 0) return;

    if (!dirEnsured) {
      if (!existsSync(themesDir)) mkdirSync(themesDir, { recursive: true });
      dirEnsured = true;
    }

    let count = 0;
    for (const theme of themes as CustomThemePack[]) {
      const dest = join(themesDir, `${theme.id}.json`);
      if (!existsSync(dest)) {
        try {
          writeFileSync(dest, JSON.stringify(theme, null, 2), "utf-8");
          count++;
        } catch (e) {
          logWarn(
            "migrations",
            `themes: failed to write ${theme.id} (profile ${profileId})`,
            e,
          );
        }
      }
    }

    // Strip migrated key from config.json so this branch never fires again.
    const { customThemes: _ct, ...restSettings } = settings;
    patchConfigJson(profileDir, raw, restSettings);

    if (count > 0) {
      logInfo(
        "migrations",
        `themes: migrated ${count} theme(s) from profile ${profileId}`,
      );
    }
  });
}
