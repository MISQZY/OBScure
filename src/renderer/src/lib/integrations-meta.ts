import { Music, Music2, Radio, Video, type LucideIcon } from 'lucide-react'
import type { IntegrationKey } from '@shared/types'
import type { NavKey } from '@/lib/nav'

interface IntegrationMeta {
  label: string
  icon: LucideIcon
  navKey: NavKey
}

export const INTEGRATIONS_META: Record<IntegrationKey, IntegrationMeta> = {
  spotify: { label: 'Spotify', icon: Music2, navKey: 'integrations/spotify' },
  windowsMedia: { label: 'Windows Media', icon: Music, navKey: 'integrations/windows-media' },
  twitch: { label: 'Twitch', icon: Radio, navKey: 'integrations/twitch' },
  youtube: { label: 'YouTube', icon: Video, navKey: 'integrations/youtube' }
}

export const INTEGRATION_KEYS = Object.keys(INTEGRATIONS_META) as IntegrationKey[]
