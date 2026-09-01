import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import ru from '@/localization/ru.json'
import en from '@/localization/en.json'
import { LOCALES, type LocaleId } from '@/lib/i18n/locales'
import type { Dictionary } from '@/lib/i18n/types'
import { useCustomConfig } from '@/providers/CustomConfigProvider'
import { readMigratedItem } from '@/lib/legacyStorage'

const STORAGE_KEY = 'obscure:locale'
const LEGACY_STORAGE_KEY = 'maddoner:locale'
const BUILTIN_DICTIONARIES: Record<LocaleId, Dictionary> = { ru, en }

function readStoredLocale(): string {
  try {
    return readMigratedItem(STORAGE_KEY, LEGACY_STORAGE_KEY) ?? 'ru'
  } catch {
    return 'ru'
  }
}

interface LocaleOption {
  id: string
  label: string
  shortLabel: string
}

interface I18nContextValue {
  locale: string
  t: Dictionary
  locales: LocaleOption[]
  setLocale: (locale: string) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const { customLocales } = useCustomConfig()
  const [locale, setLocaleState] = useState<string>(() => readStoredLocale())

  const dictionaries = useMemo<Record<string, Dictionary>>(() => {
    const custom = Object.fromEntries(customLocales.map((entry) => [entry.id, entry.dictionary]))
    return { ...BUILTIN_DICTIONARIES, ...custom }
  }, [customLocales])

  const locales = useMemo<LocaleOption[]>(
    () => [...LOCALES, ...customLocales.map((entry) => ({ id: entry.id, label: entry.name, shortLabel: entry.shortLabel }))],
    [customLocales]
  )

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: string) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Locale just won't persist across restarts in this environment.
    }
  }, [])

  // A deleted custom language shouldn't leave the app pointed at a locale id with no dictionary.
  useEffect(() => {
    if (!dictionaries[locale]) setLocale('ru')
  }, [locale, dictionaries, setLocale])

  const value = useMemo<I18nContextValue>(
    () => ({ locale, t: dictionaries[locale] ?? ru, locales, setLocale }),
    [locale, dictionaries, locales, setLocale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider')
  return ctx
}
