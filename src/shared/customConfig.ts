export interface CustomThemePack {
  id: string
  name: string
  mode: 'light' | 'dark'
  colors: Record<string, string>
  titleBarOverlay: { color: string; symbolColor: string }
}

export interface CustomLocalePack {
  id: string
  name: string
  shortLabel: string
  dictionary: Record<string, unknown>
}
