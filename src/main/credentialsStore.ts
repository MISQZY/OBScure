import { safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logError } from "./logger";

interface StoredCredentials {
  /** OAuth refresh tokens, OS-encrypted via safeStorage (same scheme as ConfigStore.secrets). */
  secrets: Record<string, string>;
  /** Client IDs / client secrets for third-party apps — sensitive but not OS-encrypted. */
  clientIds: Record<string, string>;
}

const DEFAULT_CREDENTIALS: StoredCredentials = { secrets: {}, clientIds: {} };

/**
 * Persists integration credentials (OAuth refresh tokens, client IDs/secrets)
 * in `<profileDir>/credentials.json`, separate from the rest of the profile's
 * settings in config.json.
 */
export class CredentialsStore {
  private readonly filePath: string;
  private data: StoredCredentials;

  constructor(profileDir: string) {
    if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true });
    this.filePath = join(profileDir, "credentials.json");
    this.data = this.load();
  }

  private load(): StoredCredentials {
    if (!existsSync(this.filePath)) return structuredClone(DEFAULT_CREDENTIALS);
    try {
      return {
        ...structuredClone(DEFAULT_CREDENTIALS),
        ...JSON.parse(readFileSync(this.filePath, "utf-8")),
      };
    } catch {
      return structuredClone(DEFAULT_CREDENTIALS);
    }
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  getClientId(key: string): string | null {
    return this.data.clientIds[key] ?? null;
  }

  setClientId(key: string, value: string): void {
    this.data.clientIds[key] = value;
    this.save();
  }

  getSecret(key: string): string | null {
    const blob = this.data.secrets[key];
    if (!blob || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(Buffer.from(blob, "base64"));
    } catch (error) {
      logError("credentialsStore", `failed to decrypt secret "${key}"`, error);
      return null;
    }
  }

  setSecret(key: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "OS-level encryption is unavailable, refusing to store secret in plain text",
      );
    }
    this.data.secrets[key] = safeStorage
      .encryptString(value)
      .toString("base64");
    this.save();
  }

  deleteSecret(key: string): void {
    delete this.data.secrets[key];
    this.save();
  }
}
