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

/**
 * One breadcrumb segment. `navKey` is only set when the segment is itself a navigable
 * page (e.g. Dashboard) — group labels like "Tools" or "Integrations" have no page of
 * their own, so they're rendered as plain text instead of a dead link.
 */
export interface BreadcrumbCrumb {
  label: string
  navKey?: NavKey
}

/** Breadcrumb labels depend on locale, so this is built from the current dictionary rather than static data. */
export function getNavBreadcrumbs(t: Dictionary): Record<string, BreadcrumbCrumb[]> {
  const dashboard: BreadcrumbCrumb = { label: t.sidebar.dashboard, navKey: 'dashboard' }
  return {
    dashboard: [dashboard],
    'tools/random': [dashboard, { label: t.sidebar.tools }, { label: t.events.random.title }],
    'tools/roulette': [dashboard, { label: t.sidebar.tools }, { label: t.events.roulette.title }],
    'data/variables': [dashboard, { label: t.sidebar.data }, { label: t.variables.title }],
    'integrations/spotify': [dashboard, { label: t.sidebar.integrations }, { label: 'Spotify' }],
    'integrations/windows-media': [
      dashboard,
      { label: t.sidebar.integrations },
      { label: t.integrations.windowsMedia.title }
    ],
    'integrations/twitch': [dashboard, { label: t.sidebar.integrations }, { label: 'Twitch' }],
    'integrations/youtube': [dashboard, { label: t.sidebar.integrations }, { label: 'YouTube' }],
    settings: [dashboard, { label: t.sidebar.settings }]
  }
}

/** Fallback breadcrumbs for nav keys with no static entry above (e.g. dynamic custom overlay pages). */
export function getDefaultBreadcrumbs(t: Dictionary): BreadcrumbCrumb[] {
  return [{ label: t.sidebar.dashboard, navKey: 'dashboard' }, { label: t.sidebar.overlays }]
}
