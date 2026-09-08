import { useState } from 'react'

/** Same 'obscure:*' localStorage convention as ThemeProvider/I18nProvider's own persisted preferences. */
function storageKeyFor(persistKey: string): string {
  return `obscure:collapsibleSection:${persistKey}`
}

/**
 * Open/closed boolean state persisted across app restarts under
 * `obscure:collapsibleSection:<persistKey>`. Shared by CollapsibleSection
 * (settings page) and AppSidebar's own collapsible nav groups, so a section
 * a user expands stays expanded on the next launch instead of resetting to
 * `defaultOpen` every time.
 *
 * `persistKey` is `undefined ` for a plain, unpersisted disclosure (no
 * localStorage read/write) — kept as a hook parameter rather than an early
 * return at the call site so the underlying useState call stays
 * unconditional.
 */
export function usePersistedOpen(persistKey: string | undefined, defaultOpen = false): [boolean, (next: boolean) => void] {
  const [open, setOpenState] = useState<boolean>(() => {
    if (!persistKey) return defaultOpen
    try {
      const stored = localStorage.getItem(storageKeyFor(persistKey))
      return stored === null ? defaultOpen : stored === 'true'
    } catch {
      return defaultOpen
    }
  })

  const setOpen = (next: boolean): void => {
    setOpenState(next)
    if (!persistKey) return
    try {
      localStorage.setItem(storageKeyFor(persistKey), String(next))
    } catch {
      // Open/closed state just won't persist across restarts in this environment.
    }
  }

  return [open, setOpen]
}
