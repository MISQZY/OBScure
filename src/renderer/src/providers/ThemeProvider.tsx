import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BUILTIN_THEMES,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  type ThemeDefinition,
  type ThemePreference
} from '@/lib/theme'
import { useCustomConfig } from '@/providers/CustomConfigProvider'

const STORAGE_KEY = 'maddoner:theme'

function readStoredPreference(): ThemePreference {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? 'system'
  } catch {
    return 'system'
  }
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveTheme(preference: ThemePreference, themes: ThemeDefinition[]): ThemeDefinition {
  if (preference === 'system') {
    const fallbackId = prefersDark() ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID
    return themes.find((theme) => theme.id === fallbackId) ?? themes[0]
  }
  return themes.find((theme) => theme.id === preference) ?? themes.find((theme) => theme.id === DEFAULT_LIGHT_THEME_ID) ?? themes[0]
}

/** Kept in sync with the bootstrap script in index.html, which applies the same
 *  result before first paint to avoid a flash of the wrong theme. */
function applyThemeToDocument(theme: ThemeDefinition): void {
  document.documentElement.dataset.theme = theme.id
  document.documentElement.classList.toggle('dark', theme.mode === 'dark')
  for (const [key, value] of Object.entries(theme.colors)) {
    document.documentElement.style.setProperty(key, value)
  }
  void window.maddoner?.setTitleBarOverlay(theme.titleBarOverlay)
}

interface ThemeContextValue {
  preference: ThemePreference
  resolvedThemeId: string
  themes: ThemeDefinition[]
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { customThemes } = useCustomConfig()
  const themes = useMemo<ThemeDefinition[]>(() => [...BUILTIN_THEMES, ...customThemes], [customThemes])

  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredPreference())
  const [resolvedThemeId, setResolvedThemeId] = useState<string>(() => resolveTheme(preference, themes).id)

  useEffect(() => {
    const nextTheme = resolveTheme(preference, themes)
    setResolvedThemeId(nextTheme.id)
    applyThemeToDocument(nextTheme)

    if (preference !== 'system') return undefined

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      const systemTheme = resolveTheme('system', themes)
      setResolvedThemeId(systemTheme.id)
      applyThemeToDocument(systemTheme)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [preference, themes])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Theme just won't persist across restarts in this environment (e.g. private storage disabled).
    }
  }, [])

  // A deleted custom theme shouldn't leave the app pointed at a preference that no longer resolves to anything real.
  useEffect(() => {
    if (preference === 'system') return
    if (!themes.some((theme) => theme.id === preference)) setPreference('system')
  }, [preference, themes, setPreference])

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedThemeId, themes, setPreference }),
    [preference, resolvedThemeId, themes, setPreference]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
