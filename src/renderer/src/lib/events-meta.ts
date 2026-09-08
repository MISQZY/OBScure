import { Dices, Disc, ListOrdered, type LucideIcon } from 'lucide-react'
import type { EventTarget } from '@shared/eventsConfig'
import type { NavKey } from '@/lib/nav'
import type { Dictionary } from '@/lib/i18n/types'

interface EventMeta {
  icon: LucideIcon
  navKey: NavKey
}

export const EVENTS_META: Record<EventTarget, EventMeta> = {
  random: { icon: Dices, navKey: 'tools/random' },
  roulette: { icon: Disc, navKey: 'tools/roulette' },
  queue: { icon: ListOrdered, navKey: 'tools/queue' }
}

export const EVENT_KEYS = Object.keys(EVENTS_META) as EventTarget[]

export function eventLabels(t: Dictionary): Record<EventTarget, string> {
  return {
    random: t.events.random.title,
    roulette: t.events.roulette.title,
    queue: t.events.queue.title
  }
}
