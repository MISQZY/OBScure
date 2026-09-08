import { Moon, Sun, type LucideIcon } from 'lucide-react'
import lightTheme from '@/theme/light.json'
import darkTheme from '@/theme/dark.json'

export interface ThemeDefinition {
  id: string
  /** Key into the i18n dictionary's `theme` bucket, used for the switcher's tooltip/label. Absent for custom (uploaded) themes, which use `name` instead. */
  labelKey?: 'light' | 'dark'
  /** Plain display name — only set on custom (uploaded) themes, which have no dictionary entry. */
  name?: string
  icon: LucideIcon
  /** Drives Tailwind's `dark:` utility variant independently of the CSS palette below. */
  mode: 'light' | 'dark'
  /**
   * Hex equivalents of this theme's --titlebar / --muted-foreground CSS vars,
   * for the native DWM-drawn titlebar buttons (see titleBarOverlay in
   * src/main/index.ts) — those are painted outside the page, so they can't
   * just read the CSS vars and need these mirrored here.
   */
  titleBarOverlay: { color: string; symbolColor: string }
  /** CSS custom properties applied to :root by ThemeProvider — see theme/light.json and theme/dark.json. */
  colors: Record<string, string>
}

const BUILTIN_ICONS: Record<string, LucideIcon> = { light: Sun, dark: Moon }

/**
 * Built-in themes, sourced from theme/light.json and theme/dark.json — the
 * icon is attached here since a React component can't be serialized to JSON.
 * A custom theme (uploaded via Settings) uses this same shape (minus a
 * dictionary labelKey) and is merged in at the provider level — see
 * CustomConfigProvider / ThemeProvider.
 */
export const BUILTIN_THEMES: ThemeDefinition[] = [lightTheme, darkTheme].map((theme) => ({
  ...theme,
  icon: BUILTIN_ICONS[theme.id] ?? Sun
})) as ThemeDefinition[]

export type ThemePreference = 'system' | string

export const DEFAULT_LIGHT_THEME_ID = 'light'
export const DEFAULT_DARK_THEME_ID = 'dark'
