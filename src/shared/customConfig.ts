export interface CustomThemePack {
  id: string
  name: string
  mode: 'light' | 'dark'
  colors: Record<string, string>
  /** Derived from `colors` (--sidebar / --muted-foreground) on save — see deriveTitleBarOverlay. Optional only for packs saved before that derivation existed. */
  titleBarOverlay?: { color: string; symbolColor: string }
}

export interface CustomLocalePack {
  id: string
  name: string
  shortLabel: string
  dictionary: Record<string, unknown>
}
