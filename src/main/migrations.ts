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
  migrateCredentialsToOwnFile(userDataDir);
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

/** ConfigStore keeps plain settings under the top-level `settings` object. */
function readSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const settings = raw["settings"];
  return settings && typeof settings === "object"
    ? (settings as Record<string, unknown>)
    : {};
}

/** ConfigStore keeps OS-encrypted secrets under the top-level `secrets` object. */
function readSecrets(raw: Record<string, unknown>): Record<string, unknown> {
  const secrets = raw["secrets"];
  return secrets && typeof secrets === "object"
    ? (secrets as Record<string, unknown>)
    : {};
}

function patchConfigJson(
  profileDir: string,
  next: Record<string, unknown>,
): void {
  const configPath = join(profileDir, "config.json");
  try {
    writeFileSync(configPath, JSON.stringify(next, null, 2), "utf-8");
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
    patchConfigJson(profileDir, { ...raw, settings: restSettings });

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
    patchConfigJson(profileDir, { ...raw, settings: restSettings });

    if (count > 0) {
      logInfo(
        "migrations",
        `themes: migrated ${count} theme(s) from profile ${profileId}`,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Migration: integration credentials  (v3 → v4)
// ---------------------------------------------------------------------------

/** Client ID / client secret keys that used to live under config.json's `settings`. */
const CREDENTIAL_SETTING_KEYS = [
  "spotify.clientId",
  "twitch.clientId",
  "youtube.clientId",
  "youtube.clientSecret",
] as const;

/** OAuth refresh token keys that used to live under config.json's `secrets`. */
const CREDENTIAL_SECRET_KEYS = [
  "spotify.refreshToken",
  "twitch.refreshToken",
  "youtube.refreshToken",
] as const;

interface StoredCredentials {
  secrets: Record<string, string>;
  clientIds: Record<string, string>;
}

/**
 * Before: `<profileDir>/config.json`  →  `settings.*.clientId` / `secrets.*.refreshToken`
 * After:  `<profileDir>/credentials.json`  →  `{ clientIds: {...}, secrets: {...} }`
 *
 * Rationale: integration credentials (OAuth tokens, client IDs/secrets) are
 * kept out of the same file as ordinary UI settings, mirroring CredentialsStore.
 */
function migrateCredentialsToOwnFile(userDataDir: string): void {
  eachProfileDir(userDataDir, (profileDir, profileId) => {
    const raw = readConfigJson(profileDir);
    if (!raw) return;
    const settings = readSettings(raw);
    const secrets = readSecrets(raw);

    const settingKeys = CREDENTIAL_SETTING_KEYS.filter(
      (key) => typeof settings[key] === "string",
    );
    const secretKeys = CREDENTIAL_SECRET_KEYS.filter(
      (key) => typeof secrets[key] === "string",
    );
    if (settingKeys.length === 0 && secretKeys.length === 0) return;

    const credentialsPath = join(profileDir, "credentials.json");
    let credentials: StoredCredentials = { secrets: {}, clientIds: {} };
    if (existsSync(credentialsPath)) {
      try {
        credentials = {
          secrets: {},
          clientIds: {},
          ...JSON.parse(readFileSync(credentialsPath, "utf-8")),
        };
      } catch {
        /* start fresh if the existing file is corrupt */
      }
    }

    // Never clobber credentials already present in the new file with stale
    // config.json content.
    for (const key of settingKeys) {
      if (!(key in credentials.clientIds)) {
        credentials.clientIds[key] = settings[key] as string;
      }
    }
    for (const key of secretKeys) {
      if (!(key in credentials.secrets)) {
        credentials.secrets[key] = secrets[key] as string;
      }
    }

    try {
      writeFileSync(
        credentialsPath,
        JSON.stringify(credentials, null, 2),
        "utf-8",
      );
    } catch (e) {
      logWarn(
        "migrations",
        `credentials: failed to write credentials.json (profile ${profileId})`,
        e,
      );
      return;
    }

    // Strip migrated keys from config.json so this branch never fires again.
    const restSettings = { ...settings };
    for (const key of settingKeys) delete restSettings[key];
    const restSecrets = { ...secrets };
    for (const key of secretKeys) delete restSecrets[key];
    patchConfigJson(profileDir, {
      ...raw,
      settings: restSettings,
      secrets: restSecrets,
    });

    logInfo(
      "migrations",
      `credentials: migrated ${settingKeys.length + secretKeys.length} key(s) from profile ${profileId}`,
    );
  });
}
