import type { Dictionary } from '@/lib/i18n/types'

export type NavKey =
  | 'dashboard'
  | 'tools/random'
  | 'tools/roulette'
  | 'data/variables'
  | 'integrations/spotify'
  | 'integrations/windows-media'
  | 'integrations/twitch'
  | 'integrations/youtube'
  | 'settings'
  | `overlays/custom/${string}`

/** Breadcrumb labels depend on locale, so this is built from the current dictionary rather than static data. */
export function getNavBreadcrumbs(t: Dictionary): Record<string, string[]> {
  return {
    dashboard: [t.sidebar.dashboard],
    'tools/random': [t.sidebar.tools, t.events.random.title],
    'tools/roulette': [t.sidebar.tools, t.events.roulette.title],
    'data/variables': [t.sidebar.data, t.variables.title],
    'integrations/spotify': [t.sidebar.integrations, 'Spotify'],
    'integrations/windows-media': [t.sidebar.integrations, t.integrations.windowsMedia.title],
    'integrations/twitch': [t.sidebar.integrations, 'Twitch'],
    'integrations/youtube': [t.sidebar.integrations, 'YouTube'],
    settings: [t.sidebar.settings]
  }
}
