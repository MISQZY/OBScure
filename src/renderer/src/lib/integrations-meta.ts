import { Bot, Music, type LucideIcon } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { ObsIcon, SpotifyIcon, TwitchIcon, YoutubeIcon } from '@/components/BrandIcon'
import type { IntegrationKey } from '@shared/types'
import type { NavKey } from '@/lib/nav'

export type IntegrationGroup = 'platform' | 'music' | 'automation'

type IntegrationIcon = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>

interface IntegrationMeta {
  label: string
  icon: IntegrationIcon
  navKey: NavKey
  group: IntegrationGroup
}

export const INTEGRATIONS_META: Record<IntegrationKey, IntegrationMeta> = {
  twitch: { label: 'Twitch', icon: TwitchIcon, navKey: 'integrations/twitch', group: 'platform' },
  youtube: { label: 'YouTube', icon: YoutubeIcon, navKey: 'integrations/youtube', group: 'platform' },
  spotify: { label: 'Spotify', icon: SpotifyIcon, navKey: 'integrations/spotify', group: 'music' },
  // "Windows Media" is a Windows API surface, not a product with its own
  // brand mark — simple-icons has no entry for it, so this stays a generic
  // lucide icon.
  windowsMedia: { label: 'Windows Media', icon: Music, navKey: 'integrations/windows-media', group: 'music' },
  // Streamer.bot has no simple-icons entry either (too niche for its
  // curated brand list) — same fallback.
  streamerbot: { label: 'Streamer.bot', icon: Bot, navKey: 'integrations/streamerbot', group: 'automation' },
  obs: { label: 'OBS', icon: ObsIcon, navKey: 'integrations/obs', group: 'automation' }
}

export const INTEGRATION_KEYS = Object.keys(INTEGRATIONS_META) as IntegrationKey[]

/** Display order for the grouped sidebar sub-menu. */
export const INTEGRATION_GROUP_ORDER: IntegrationGroup[] = ['platform', 'music', 'automation']

export const INTEGRATION_KEYS_BY_GROUP: Record<IntegrationGroup, IntegrationKey[]> =
  INTEGRATION_GROUP_ORDER.reduce(
    (acc, group) => {
      acc[group] = INTEGRATION_KEYS.filter((key) => INTEGRATIONS_META[key].group === group)
      return acc
    },
    {} as Record<IntegrationGroup, IntegrationKey[]>
  )
