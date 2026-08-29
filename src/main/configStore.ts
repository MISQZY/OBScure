import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface StoredConfig {
  /** Base64-encoded, OS-encrypted blobs (OAuth tokens, client secrets, ...). */
  secrets: Record<string, string>
  /** Plain, non-sensitive settings (client IDs, feature toggles, ...). */
  settings: Record<string, unknown>
}

const DEFAULT_CONFIG: StoredConfig = { secrets: {}, settings: {} }

/**
 * Plain settings live in a JSON file under `profileDir`; secrets are
 * additionally encrypted with Electron's OS-level safeStorage before being
 * written to disk. `profileDir` is per-profile (see profileStore.ts) so each
 * saved profile keeps entirely separate settings/secrets.
 */
export class ConfigStore {
  private readonly filePath: string
  private data: StoredConfig

  constructor(profileDir: string) {
    if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true })
    this.filePath = join(profileDir, 'config.json')
    this.data = this.load()
  }

  private load(): StoredConfig {
    if (!existsSync(this.filePath)) return structuredClone(DEFAULT_CONFIG)
    try {
      return { ...structuredClone(DEFAULT_CONFIG), ...JSON.parse(readFileSync(this.filePath, 'utf-8')) }
    } catch {
      return structuredClone(DEFAULT_CONFIG)
    }
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  getSetting<T>(key: string, fallback: T): T {
    return (this.data.settings[key] as T | undefined) ?? fallback
  }

  setSetting(key: string, value: unknown): void {
    this.data.settings[key] = value
    this.save()
  }

  /** Treats an undecryptable blob (corrupted, or encrypted under a since-changed OS key) the same as "no secret" instead of throwing — a throw here would otherwise escape callers like TwitchIntegration.start() before they even reach their own try/catch. */
  getSecret(key: string): string | null {
    const blob = this.data.secrets[key]
    if (!blob || !safeStorage.isEncryptionAvailable()) return null
    try {
      return safeStorage.decryptString(Buffer.from(blob, 'base64'))
    } catch (error) {
      console.error(`[configStore] failed to decrypt secret "${key}":`, error)
      return null
    }
  }

  setSecret(key: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS-level encryption is unavailable, refusing to store secret in plain text')
    }
    this.data.secrets[key] = safeStorage.encryptString(value).toString('base64')
    this.save()
  }

  deleteSecret(key: string): void {
    delete this.data.secrets[key]
    this.save()
  }
}
