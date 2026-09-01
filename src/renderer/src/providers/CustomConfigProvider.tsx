import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Palette } from 'lucide-react'
import type { CustomLocalePack, CustomThemePack } from '@shared/customConfig'
import { BUILTIN_THEMES, type ThemeDefinition } from '@/lib/theme'
import type { Dictionary } from '@/lib/i18n/types'
import { LOCALES } from '@/lib/i18n/locales'
import en from '@/localization/en.json'
import { slugify, uniqueUrlKey } from '@/lib/custom-overlays'
import { deriveTitleBarOverlay } from '@/lib/color'

const THEME_CACHE_KEY = 'maddoner:customThemeCache'
const LOCALE_CACHE_KEY = 'maddoner:customLocaleCache'

export interface CustomLocaleEntry {
  id: string
  name: string
  shortLabel: string
  dictionary: Dictionary
}

function readCache<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function writeCache<T>(key: string, value: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Cache is a bootstrap convenience only — a failed write just means the
    // next launch briefly falls back to the default theme/language.
  }
}

/** Recursively overlays `patch` onto `base`, keeping any key `patch` doesn't set — so a partial custom dictionary or theme palette still resolves every field instead of crashing on the first missing one. */
function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const baseValue = result[key]
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      result[key] = deepMerge(baseValue as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result as T
}

/**
 * Fills in `colors` against the current base palette (self-healing a pack
 * saved before some newer CSS var existed) and recomputes titleBarOverlay
 * from THAT merged result rather than trusting whatever hex value was last
 * saved with it — so a theme edited (or hand-written) to change --titlebar/
 * --muted-foreground can't leave the native titlebar buttons pointing at a
 * stale color. titleBarOverlay falls back to the saved value, then the
 * built-in default, only if the colors can't be parsed.
 */
function normalizeThemePack(pack: CustomThemePack): CustomThemePack {
  const base = BUILTIN_THEMES.find((theme) => theme.mode === pack.mode) ?? BUILTIN_THEMES[0]
  const colors = deepMerge(base.colors, pack.colors ?? {})
  return {
    ...pack,
    colors,
    titleBarOverlay: deriveTitleBarOverlay(colors, pack.titleBarOverlay ?? base.titleBarOverlay)
  }
}

function packToThemeDefinition(pack: CustomThemePack): ThemeDefinition {
  const base = BUILTIN_THEMES.find((theme) => theme.mode === pack.mode) ?? BUILTIN_THEMES[0]
  const normalized = normalizeThemePack(pack)
  return {
    id: normalized.id,
    name: normalized.name,
    icon: Palette,
    mode: normalized.mode,
    titleBarOverlay: normalized.titleBarOverlay ?? base.titleBarOverlay,
    colors: normalized.colors
  }
}

function packToLocaleEntry(pack: CustomLocalePack): CustomLocaleEntry {
  return {
    id: pack.id,
    name: pack.name,
    shortLabel: pack.shortLabel,
    dictionary: deepMerge(en as Dictionary, (pack.dictionary ?? {}) as Record<string, unknown>)
  }
}

export type UploadOutcome = 'ok' | 'invalid' | 'cancelled'

interface CustomConfigContextValue {
  customThemes: ThemeDefinition[]
  customLocales: CustomLocaleEntry[]
  uploadTheme: () => Promise<UploadOutcome>
  uploadLocale: () => Promise<UploadOutcome>
  deleteCustomTheme: (id: string) => Promise<void>
  deleteCustomLocale: (id: string) => Promise<void>
  downloadExampleTheme: () => Promise<boolean>
  downloadExampleLocale: () => Promise<boolean>
}

const CustomConfigContext = createContext<CustomConfigContextValue | null>(null)

export function CustomConfigProvider({ children }: { children: ReactNode }) {
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>(() =>
    readCache<CustomThemePack>(THEME_CACHE_KEY).map(packToThemeDefinition)
  )
  const [customLocales, setCustomLocales] = useState<CustomLocaleEntry[]>(() =>
    readCache<CustomLocalePack>(LOCALE_CACHE_KEY).map(packToLocaleEntry)
  )

  // Re-derives titleBarOverlay before caching so theme-init.js's bootstrap
  // cache — which applies a custom theme's overlay directly, with no
  // conversion logic of its own — never reads a stale/hand-authored value.
  const cacheThemePacks = (packs: CustomThemePack[]): CustomThemePack[] => {
    const normalized = packs.map(normalizeThemePack)
    writeCache(THEME_CACHE_KEY, normalized)
    return normalized
  }

  useEffect(() => {
    window.maddoner.getCustomThemes().then((packs) => {
      setCustomThemes(cacheThemePacks(packs).map(packToThemeDefinition))
    })
    window.maddoner.getCustomLocales().then((packs) => {
      writeCache(LOCALE_CACHE_KEY, packs)
      setCustomLocales(packs.map(packToLocaleEntry))
    })
  }, [])

  const deleteCustomTheme = async (id: string): Promise<void> => {
    const packs = await window.maddoner.deleteCustomTheme(id)
    setCustomThemes(cacheThemePacks(packs).map(packToThemeDefinition))
  }

  const deleteCustomLocale = async (id: string): Promise<void> => {
    const packs = await window.maddoner.deleteCustomLocale(id)
    writeCache(LOCALE_CACHE_KEY, packs)
    setCustomLocales(packs.map(packToLocaleEntry))
  }

  const uploadTheme = async (): Promise<UploadOutcome> => {
    const file = await window.maddoner.openConfigFile()
    if (!file) return 'cancelled'

    let parsed: unknown
    try {
      parsed = JSON.parse(file.content)
    } catch {
      return 'invalid'
    }
    if (!parsed || typeof parsed !== 'object') return 'invalid'
    const payload = parsed as Partial<CustomThemePack>
    // A theme file must declare at least one of these — otherwise it's probably a locale file (or garbage).
    if (payload.mode === undefined && payload.colors === undefined) return 'invalid'

    const mode = payload.mode === 'dark' ? 'dark' : 'light'
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : 'Custom theme'
    const existingIds = [...BUILTIN_THEMES.map((t) => t.id), ...customThemes.map((t) => t.id)]
    const id =
      typeof payload.id === 'string' && payload.id && !existingIds.includes(payload.id)
        ? payload.id
        : uniqueUrlKey(name, existingIds)
    const base = BUILTIN_THEMES.find((t) => t.mode === mode) ?? BUILTIN_THEMES[0]
    const colors = deepMerge(base.colors, (payload.colors as Record<string, string>) ?? {})
    const pack: CustomThemePack = {
      id,
      name,
      mode,
      colors,
      titleBarOverlay: deriveTitleBarOverlay(colors, payload.titleBarOverlay ?? base.titleBarOverlay)
    }
    const packs = await window.maddoner.saveCustomTheme(pack)
    setCustomThemes(cacheThemePacks(packs).map(packToThemeDefinition))
    return 'ok'
  }

  const uploadLocale = async (): Promise<UploadOutcome> => {
    const file = await window.maddoner.openConfigFile()
    if (!file) return 'cancelled'

    let parsed: unknown
    try {
      parsed = JSON.parse(file.content)
    } catch {
      return 'invalid'
    }
    if (!parsed || typeof parsed !== 'object') return 'invalid'
    const payload = parsed as Partial<CustomLocalePack>
    // A locale file must declare a dictionary — otherwise it's probably a theme file (or garbage).
    if (!payload.dictionary || typeof payload.dictionary !== 'object') return 'invalid'

    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : 'Custom language'
    const shortLabel =
      typeof payload.shortLabel === 'string' && payload.shortLabel.trim()
        ? payload.shortLabel.trim().slice(0, 3).toUpperCase()
        : slugify(name).slice(0, 2).toUpperCase()
    const existingIds = [...LOCALES.map((l) => l.id), ...customLocales.map((l) => l.id)]
    const id =
      typeof payload.id === 'string' && payload.id && !existingIds.includes(payload.id)
        ? payload.id
        : uniqueUrlKey(name, existingIds)
    const pack: CustomLocalePack = {
      id,
      name,
      shortLabel,
      dictionary: payload.dictionary as Record<string, unknown>
    }
    const packs = await window.maddoner.saveCustomLocale(pack)
    writeCache(LOCALE_CACHE_KEY, packs)
    setCustomLocales(packs.map(packToLocaleEntry))
    return 'ok'
  }

  const downloadExampleTheme = async (): Promise<boolean> => {
    const lightTheme = BUILTIN_THEMES.find((t) => t.id === 'light') ?? BUILTIN_THEMES[0]
    // titleBarOverlay is deliberately omitted: it's derived from --titlebar /
    // --muted-foreground in `colors` on upload, so the example doesn't need
    // (and shouldn't show) a hex duplicate that could drift out of sync.
    const payload: CustomThemePack = {
      id: 'example-theme',
      name: 'Example theme',
      mode: lightTheme.mode,
      colors: lightTheme.colors
    }
    return window.maddoner.saveConfigFile('example-theme.json', JSON.stringify(payload, null, 2))
  }

  const downloadExampleLocale = async (): Promise<boolean> => {
    const payload: CustomLocalePack = {
      id: 'example-lang',
      name: 'Example language',
      shortLabel: 'XX',
      dictionary: en
    }
    return window.maddoner.saveConfigFile('example-lang.json', JSON.stringify(payload, null, 2))
  }

  return (
    <CustomConfigContext.Provider
      value={{
        customThemes,
        customLocales,
        uploadTheme,
        uploadLocale,
        deleteCustomTheme,
        deleteCustomLocale,
        downloadExampleTheme,
        downloadExampleLocale
      }}
    >
      {children}
    </CustomConfigContext.Provider>
  )
}

export function useCustomConfig(): CustomConfigContextValue {
  const ctx = useContext(CustomConfigContext)
  if (!ctx) throw new Error('useCustomConfig must be used within a CustomConfigProvider')
  return ctx
}
