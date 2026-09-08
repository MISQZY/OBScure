import { isFiniteNumber } from './overlayConfig'

/**
 * "Инструменты" (Tools) config — internal on-stream tools (a provably-fair
 * random roll, a chat-driven roulette) with no Browser Source/overlay of
 * their own; results only ever show inside the app itself (see
 * pages/tools/*) and, for Roulette, in chat via the bot. Kept as its own
 * EventsConfigs/EventTarget union rather than folding into a generic config
 * bag since each tool's settings shape is unrelated to the other's.
 */
export interface RandomConfig {
  min: number
  max: number
  count: number
}

/** Who's allowed to enter via the chat command or the points reward — see isEligibleForRoulette in index.ts. Manual adds from the app itself are never gated by this. */
export type RouletteEntryMode = 'all' | 'followers' | 'subscribers'

export interface RouletteConfig {
  /** Chat message that adds its sender as an entrant while a round is collecting (case-insensitive, e.g. "!рулетка"). */
  command: string
  /** Twitch custom reward id that adds the redeemer as an entrant; null disables points-based entry. */
  pointsRewardId: string | null
  /** How long a round accepts entrants before spinning — clamped to [MIN_ROULETTE_DURATION_SECONDS, MAX_ROULETTE_DURATION_SECONDS]. RouletteToolPage's duration picker converts this to/from whatever unit (seconds/minutes/hours/days/weeks) the user picks; the stored value itself is always plain seconds. */
  durationSeconds: number
  entryMode: RouletteEntryMode
}

export const MIN_ROULETTE_DURATION_SECONDS = 5
/** One week — long enough for a giveaway-style round that spans multiple streams, without an unbounded number that could overflow setTimeout's 32-bit delay (~24.8 days) or just sit forever accepting entrants. */
export const MAX_ROULETTE_DURATION_SECONDS = 7 * 24 * 60 * 60

export interface EventsConfigs {
  random: RandomConfig
  roulette: RouletteConfig
}

export type EventTarget = keyof EventsConfigs

export const DEFAULT_RANDOM_CONFIG: RandomConfig = {
  min: 1,
  max: 100,
  count: 1
}

export const DEFAULT_ROULETTE_CONFIG: RouletteConfig = {
  command: '!рулетка',
  pointsRewardId: null,
  durationSeconds: 60,
  entryMode: 'all'
}

const ROULETTE_ENTRY_MODES: RouletteEntryMode[] = ['all', 'followers', 'subscribers']

export const DEFAULT_EVENTS_CONFIGS: EventsConfigs = {
  random: DEFAULT_RANDOM_CONFIG,
  roulette: DEFAULT_ROULETTE_CONFIG
}

export function normalizeRandomConfig(value: unknown): RandomConfig {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<RandomConfig>
  const fallback = DEFAULT_RANDOM_CONFIG
  const min = isFiniteNumber(entry.min) ? Math.trunc(entry.min) : fallback.min
  const maxCandidate = isFiniteNumber(entry.max) ? Math.trunc(entry.max) : fallback.max
  const max = maxCandidate > min ? maxCandidate : min + 1
  const count = isFiniteNumber(entry.count) ? Math.min(10, Math.max(1, Math.trunc(entry.count))) : fallback.count
  return { min, max, count }
}

export function normalizeRouletteConfig(value: unknown): RouletteConfig {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<RouletteConfig>
  const fallback = DEFAULT_ROULETTE_CONFIG
  return {
    command: typeof entry.command === 'string' && entry.command.trim() ? entry.command : fallback.command,
    pointsRewardId: typeof entry.pointsRewardId === 'string' && entry.pointsRewardId ? entry.pointsRewardId : null,
    durationSeconds:
      isFiniteNumber(entry.durationSeconds) && entry.durationSeconds > 0
        ? Math.min(MAX_ROULETTE_DURATION_SECONDS, Math.max(MIN_ROULETTE_DURATION_SECONDS, Math.trunc(entry.durationSeconds)))
        : fallback.durationSeconds,
    entryMode:
      typeof entry.entryMode === 'string' && ROULETTE_ENTRY_MODES.includes(entry.entryMode as RouletteEntryMode)
        ? (entry.entryMode as RouletteEntryMode)
        : fallback.entryMode
  }
}
