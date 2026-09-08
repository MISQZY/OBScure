/**
 * Reads a localStorage value that may still be filed under this app's old
 * 'maddoner:' key prefix, from before it was renamed to OBScure. Migrates it
 * onto `key` in place on the first hit, so every read after that goes
 * through a plain `localStorage.getItem(key)` at the call site.
 */
export function readMigratedItem(key: string, legacyKey: string): string | null {
  const value = localStorage.getItem(key)
  if (value !== null) return value
  const legacy = localStorage.getItem(legacyKey)
  if (legacy !== null) {
    localStorage.setItem(key, legacy)
    localStorage.removeItem(legacyKey)
  }
  return legacy
}
