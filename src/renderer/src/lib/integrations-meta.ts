import { Music, Music2, Radio, Video, type LucideIcon } from 'lucide-react'
import type { IntegrationKey } from '@shared/types'
import type { NavKey } from '@/lib/nav'

export type IntegrationGroup = 'platform' | 'music'

interface IntegrationMeta {
  label: string
  icon: LucideIcon
  navKey: NavKey
  group: IntegrationGroup
}

export const INTEGRATIONS_META: Record<IntegrationKey, IntegrationMeta> = {
  twitch: { label: 'Twitch', icon: Radio, navKey: 'integrations/twitch', group: 'platform' },
  youtube: { label: 'YouTube', icon: Video, navKey: 'integrations/youtube', group: 'platform' },
  spotify: { label: 'Spotify', icon: Music2, navKey: 'integrations/spotify', group: 'music' },
  windowsMedia: { label: 'Windows Media', icon: Music, navKey: 'integrations/windows-media', group: 'music' }
}

export const INTEGRATION_KEYS = Object.keys(INTEGRATIONS_META) as IntegrationKey[]

/** Display order for the grouped sidebar sub-menu. */
export const INTEGRATION_GROUP_ORDER: IntegrationGroup[] = ['platform', 'music']

export const INTEGRATION_KEYS_BY_GROUP: Record<IntegrationGroup, IntegrationKey[]> =
  INTEGRATION_GROUP_ORDER.reduce(
    (acc, group) => {
      acc[group] = INTEGRATION_KEYS.filter((key) => INTEGRATIONS_META[key].group === group)
      return acc
    },
    {} as Record<IntegrationGroup, IntegrationKey[]>
  )
