import { isFiniteNumber } from './overlayConfig'

/**
 * "Инструменты" (Tools) config — internal on-stream tools (a provably-fair
 * random roll, a chat-driven roulette, a viewer queue) with no Browser
 * Source/overlay of their own; results only ever show inside the app itself
 * (see pages/tools/*) and, for Roulette/Queue, in chat via the bot. Kept as
 * its own EventsConfigs/EventTarget union rather than folding into a generic
 * config bag since each tool's settings shape is unrelated to the other's.
 */
export interface RandomConfig {
  min: number
  max: number
  count: number
}

/** Who's allowed to trigger a CommandConfig — via its own chat command, or (for Roulette) the points reward too. See isEligibleForCommand in index.ts. Manual adds from the app itself are never gated by this. */
export type CommandEntryMode = 'all' | 'followers' | 'subscribers'

/**
 * A chat-triggered command shared by Roulette and Queue — one or more
 * aliases (any of them matches), an optional shared prefix applied to all of
 * them, and who's allowed to trigger it. Edited via ChatCommandField, which
 * opens this as its own popover rather than a single free-text field, since
 * it's really three independent settings bundled together. Empty `aliases`
 * disables chat-triggered entry entirely for whichever feature owns this
 * config — manual adds (and, for Roulette, the points reward) still work.
 */
export interface CommandConfig {
  aliases: string[]
  hasPrefix: boolean
  /** Only meaningful while hasPrefix is true — kept even while off so toggling back on restores whatever the user had, instead of always resetting to "!". */
  prefix: string
  entryMode: CommandEntryMode
}

export interface RouletteConfig {
  command: CommandConfig
  /** Twitch custom reward id that adds the redeemer as an entrant; null disables points-based entry. */
  pointsRewardId: string | null
  /** How long a round accepts entrants before spinning — clamped to [MIN_ROULETTE_DURATION_SECONDS, MAX_ROULETTE_DURATION_SECONDS]. RouletteToolPage's duration picker converts this to/from whatever unit (seconds/minutes/hours/days/weeks) the user picks; the stored value itself is always plain seconds. */
  durationSeconds: number
}

export const MIN_ROULETTE_DURATION_SECONDS = 5
/** One week — long enough for a giveaway-style round that spans multiple streams, without an unbounded number that could overflow setTimeout's 32-bit delay (~24.8 days) or just sit forever accepting entrants. */
export const MAX_ROULETTE_DURATION_SECONDS = 7 * 24 * 60 * 60

/** Which Streamer.bot push-event the Queue feature matches against — see StreamerBotTriggerPayload's own doc comment in shared/types.ts. */
export type QueueTriggerType = 'command' | 'customEvent'

export interface QueueConfig {
  command: CommandConfig
  /** Whether a Streamer.bot Command.Triggered/Custom.Event push can add an entry at all. */
  streamerbotEnabled: boolean
  streamerbotTriggerType: QueueTriggerType
  /** Matched against Command.Triggered's own `command` field (case-insensitive) when streamerbotTriggerType is 'command'. */
  streamerbotCommandName: string
  /** Matched against Custom.Event's own `eventName` field when streamerbotTriggerType is 'customEvent'. */
  streamerbotEventName: string
  /** Which key of Custom.Event's own `args` object holds the entrant's display name. */
  streamerbotNameArgKey: string
}

export interface EventsConfigs {
  random: RandomConfig
  roulette: RouletteConfig
  queue: QueueConfig
}

export type EventTarget = keyof EventsConfigs

export const DEFAULT_RANDOM_CONFIG: RandomConfig = {
  min: 1,
  max: 100,
  count: 1
}

function defaultCommandConfig(alias: string): CommandConfig {
  return { aliases: [alias], hasPrefix: true, prefix: '!', entryMode: 'all' }
}

export const DEFAULT_ROULETTE_CONFIG: RouletteConfig = {
  command: defaultCommandConfig('рулетка'),
  pointsRewardId: null,
  durationSeconds: 60
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  command: defaultCommandConfig('очередь'),
  streamerbotEnabled: false,
  streamerbotTriggerType: 'customEvent',
  streamerbotCommandName: '',
  streamerbotEventName: 'obscure.queue.add',
  streamerbotNameArgKey: 'name'
}

const COMMAND_ENTRY_MODES: CommandEntryMode[] = ['all', 'followers', 'subscribers']
const QUEUE_TRIGGER_TYPES: QueueTriggerType[] = ['command', 'customEvent']

export const DEFAULT_EVENTS_CONFIGS: EventsConfigs = {
  random: DEFAULT_RANDOM_CONFIG,
  roulette: DEFAULT_ROULETTE_CONFIG,
  queue: DEFAULT_QUEUE_CONFIG
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

export function normalizeCommandConfig(value: unknown, fallback: CommandConfig): CommandConfig {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<CommandConfig>
  return {
    aliases: Array.isArray(entry.aliases)
      ? entry.aliases.filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0)
      : fallback.aliases,
    hasPrefix: typeof entry.hasPrefix === 'boolean' ? entry.hasPrefix : fallback.hasPrefix,
    prefix: typeof entry.prefix === 'string' && entry.prefix ? entry.prefix : fallback.prefix,
    entryMode:
      typeof entry.entryMode === 'string' && COMMAND_ENTRY_MODES.includes(entry.entryMode as CommandEntryMode)
        ? (entry.entryMode as CommandEntryMode)
        : fallback.entryMode
  }
}

export function normalizeRouletteConfig(value: unknown): RouletteConfig {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<RouletteConfig>
  const fallback = DEFAULT_ROULETTE_CONFIG
  return {
    command: normalizeCommandConfig(entry.command, fallback.command),
    pointsRewardId: typeof entry.pointsRewardId === 'string' && entry.pointsRewardId ? entry.pointsRewardId : null,
    durationSeconds:
      isFiniteNumber(entry.durationSeconds) && entry.durationSeconds > 0
        ? Math.min(MAX_ROULETTE_DURATION_SECONDS, Math.max(MIN_ROULETTE_DURATION_SECONDS, Math.trunc(entry.durationSeconds)))
        : fallback.durationSeconds
  }
}

export function normalizeQueueConfig(value: unknown): QueueConfig {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<QueueConfig>
  const fallback = DEFAULT_QUEUE_CONFIG
  return {
    command: normalizeCommandConfig(entry.command, fallback.command),
    streamerbotEnabled: typeof entry.streamerbotEnabled === 'boolean' ? entry.streamerbotEnabled : fallback.streamerbotEnabled,
    streamerbotTriggerType:
      typeof entry.streamerbotTriggerType === 'string' && QUEUE_TRIGGER_TYPES.includes(entry.streamerbotTriggerType as QueueTriggerType)
        ? (entry.streamerbotTriggerType as QueueTriggerType)
        : fallback.streamerbotTriggerType,
    streamerbotCommandName: typeof entry.streamerbotCommandName === 'string' ? entry.streamerbotCommandName : fallback.streamerbotCommandName,
    streamerbotEventName: typeof entry.streamerbotEventName === 'string' ? entry.streamerbotEventName : fallback.streamerbotEventName,
    streamerbotNameArgKey:
      typeof entry.streamerbotNameArgKey === 'string' && entry.streamerbotNameArgKey.trim()
        ? entry.streamerbotNameArgKey
        : fallback.streamerbotNameArgKey
  }
}

/** Every trigger word a CommandConfig actually matches on — each alias with the shared prefix prepended (if enabled), lowercased. Empty when `aliases` is empty (chat-triggered entry disabled). Mirrors the prefix+name split ChatCommandField edits; the stored shape itself stays one flat list either way. */
export function commandTriggerWords(command: CommandConfig): string[] {
  const prefix = command.hasPrefix ? command.prefix : ''
  return command.aliases
    .map((alias) => alias.trim())
    .filter(Boolean)
    .map((alias) => `${prefix}${alias}`.toLowerCase())
}

/** Whether `text` (a chat message) triggers `command` — exact match, or the trigger word followed by a space (so "!рулетка давай" still counts, same as the single-command matching this replaces). */
export function matchesChatCommand(text: string, command: CommandConfig): boolean {
  const trimmed = text.trim().toLowerCase()
  if (!trimmed) return false
  return commandTriggerWords(command).some((word) => trimmed === word || trimmed.startsWith(`${word} `))
}
