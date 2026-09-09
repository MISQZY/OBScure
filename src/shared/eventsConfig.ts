import { isFiniteNumber } from './overlayConfig'

/**
 * "Инструменты" (Tools) config — internal on-stream tools (a provably-fair
 * random roll, a chat-driven roulette) with no Browser Source/overlay of
 * their own; results only ever show inside the app itself (see
 * pages/tools/*) and, for Roulette, in chat via the bot. Kept as its own
 * EventsConfigs/EventTarget union rather than folding into a generic config
 * bag since each tool's settings shape is unrelated to the other's. Actions
 * & Queues (pages/actions/*) — reusable automations that play a scene and
 * their named queues — live in their own ActionConfig/ActionQueueConfig
 * types further down this file instead, since they're CRUD lists rather
 * than a single settings object per tool.
 */
export interface RandomConfig {
  min: number
  max: number
  count: number
}

/** One restricted viewer group a CommandConfig can gate entry to — see isEligibleForCommand in index.ts. Manual adds from the app itself are never gated by this. */
export type CommandEntryType = 'followers' | 'subscribers'

/**
 * One or more aliases (any of them matches), an optional shared prefix
 * applied to all of them, and who's allowed to trigger it. Edited via
 * ChatCommandField, which opens this as its own popover rather than a single
 * free-text field, since it's really three independent settings bundled
 * together. Empty `aliases` disables chat-triggered entry entirely for
 * whichever feature owns this config — manual adds (and, for Roulette, the
 * points reward) still work. See CommandDef for the named, registered form
 * of this shape that Roulette/Action actually reference.
 */
export interface CommandConfig {
  aliases: string[]
  hasPrefix: boolean
  /** Only meaningful while hasPrefix is true — kept even while off so toggling back on restores whatever the user had, instead of always resetting to "!". */
  prefix: string
  /** Which viewer groups may use this command — a viewer is eligible if they belong to *any* selected group (OR, not AND). Empty means everyone (no restriction). Edited separately from aliases/prefix (see CommandEntryTypesField), not inside ChatCommandField's own popover — it's a permission, not part of the trigger phrase itself. */
  entryTypes: CommandEntryType[]
}

/**
 * One command registered on the "Команды" page (Streamer.bot's own Commands
 * page is the model) — a named CommandConfig, editable in one place instead
 * of inline wherever it's used. Roulette/ActionConfig each hold a
 * `commandId` pointing here rather than their own embedded CommandConfig, so
 * renaming an alias or flipping its permission updates every feature that
 * uses it at once; those features pick their command by name from a
 * dropdown (see CommandSelectField) instead of editing aliases themselves.
 */
export interface CommandDef extends CommandConfig {
  id: string
  name: string
}

export interface RouletteConfig {
  /** CommandDef.id from the Commands registry; null disables chat-triggered entry entirely (manual adds and the points reward still work). */
  commandId: string | null
  /** Twitch custom reward id that adds the redeemer as an entrant; null disables points-based entry. */
  pointsRewardId: string | null
  /** How long a round accepts entrants before spinning — clamped to [MIN_ROULETTE_DURATION_SECONDS, MAX_ROULETTE_DURATION_SECONDS]. RouletteToolPage's duration picker converts this to/from whatever unit (seconds/minutes/hours/days/weeks) the user picks; the stored value itself is always plain seconds. */
  durationSeconds: number
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

const COMMAND_ENTRY_TYPES: CommandEntryType[] = ['followers', 'subscribers']

/** Seeded into a fresh profile's Commands registry so Roulette has a working chat command out of the box, same default alias the old embedded CommandConfig used. */
export const DEFAULT_ROULETTE_COMMAND_ID = 'cmd-roulette-default'

export const DEFAULT_COMMANDS: CommandDef[] = [
  { id: DEFAULT_ROULETTE_COMMAND_ID, name: 'Рулетка', aliases: ['рулетка'], hasPrefix: true, prefix: '!', entryTypes: [] }
]

export const DEFAULT_ROULETTE_CONFIG: RouletteConfig = {
  commandId: DEFAULT_ROULETTE_COMMAND_ID,
  pointsRewardId: null,
  durationSeconds: 60
}

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

export function normalizeCommandConfig(value: unknown, fallback: CommandConfig): CommandConfig {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<CommandConfig>
  return {
    aliases: Array.isArray(entry.aliases)
      ? entry.aliases.filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0)
      : fallback.aliases,
    hasPrefix: typeof entry.hasPrefix === 'boolean' ? entry.hasPrefix : fallback.hasPrefix,
    prefix: typeof entry.prefix === 'string' && entry.prefix ? entry.prefix : fallback.prefix,
    entryTypes: Array.isArray(entry.entryTypes)
      ? [...new Set(entry.entryTypes.filter((type): type is CommandEntryType => COMMAND_ENTRY_TYPES.includes(type as CommandEntryType)))]
      : fallback.entryTypes
  }
}

/** Defensive id for a CommandDef/ActionConfig/ActionQueueConfig loaded from a corrupt or hand-edited config.json — real ones are always assigned by the renderer (see CommandsPage/ActionsPage/QueuesPage), same "own it, don't need node:crypto" convention as VariablesPage's `var-...` ids. */
function fallbackId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeCommandDef(value: unknown): CommandDef {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<CommandDef>
  const fallback: CommandConfig = { aliases: [], hasPrefix: true, prefix: '!', entryTypes: [] }
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : fallbackId('command'),
    name: typeof entry.name === 'string' ? entry.name : '',
    ...normalizeCommandConfig(entry, fallback)
  }
}

export function normalizeCommandDefs(value: unknown): CommandDef[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_COMMANDS
  return value.map(normalizeCommandDef)
}

/** `commandId` may legitimately be null (chat-triggered entry disabled) — only an invalid non-string, non-null value falls back to whatever a fresh RouletteConfig/ActionConfig defaults to. */
function normalizeCommandId(value: unknown, fallback: string | null): string | null {
  if (typeof value === 'string') return value
  if (value === null) return null
  return fallback
}

export function normalizeRouletteConfig(value: unknown): RouletteConfig {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<RouletteConfig>
  const fallback = DEFAULT_ROULETTE_CONFIG
  return {
    commandId: normalizeCommandId(entry.commandId, fallback.commandId),
    pointsRewardId: typeof entry.pointsRewardId === 'string' && entry.pointsRewardId ? entry.pointsRewardId : null,
    durationSeconds:
      isFiniteNumber(entry.durationSeconds) && entry.durationSeconds > 0
        ? Math.min(MAX_ROULETTE_DURATION_SECONDS, Math.max(MIN_ROULETTE_DURATION_SECONDS, Math.trunc(entry.durationSeconds)))
        : fallback.durationSeconds
  }
}

/** Which Streamer.bot push-event an Action's own trigger matches against — mirrors StreamerBotTriggerPayload's own `kind` (see shared/types.ts). */
export type ActionTriggerType = 'command' | 'customEvent'

/**
 * One named, reusable automation — the OBScure analogue of a Streamer.bot
 * Action, scoped for now to "play a Scene Builder scene" (the only operation
 * in this app with a resolvable duration to drive a Blocking queue with; see
 * ActionQueueConfig). Triggered by its own chat command and/or a
 * Streamer.bot push event, same CommandConfig/streamerbot-trigger shape the
 * old viewer Queue tool used. Managed on the "Действия" page
 * (pages/actions/ActionsPage.tsx); runs are dispatched into `queueId` by
 * ActionQueueEngine (src/main/actionQueueEngine.ts).
 */
export interface ActionConfig {
  id: string
  name: string
  /** CustomOverlay.urlKey of the scene this Action plays. */
  sceneUrlKey: string
  /** ActionQueueConfig.id this Action's runs are enqueued into. */
  queueId: string
  /** How long one run stays "in flight" once started — a Blocking queue waits this long before starting the next pending run; see ActionQueueEngine.start. */
  durationSeconds: number
  /** CommandDef.id from the Commands registry; null disables chat-triggered entry (a Streamer.bot trigger, if enabled, still works). */
  commandId: string | null
  streamerbotEnabled: boolean
  streamerbotTriggerType: ActionTriggerType
  streamerbotCommandName: string
  streamerbotEventName: string
}

/**
 * One queue Actions can be assigned to — mirrors Streamer.bot's own Queues
 * page (Name/Pending Count/Completed Count/Paused/Blocking columns).
 * Managed on the "Очереди" page (pages/actions/QueuesPage.tsx); Pending/
 * Completed counts are runtime-only (see ActionQueueRuntimeState in
 * shared/types.ts), not part of this persisted definition.
 */
export interface ActionQueueConfig {
  id: string
  name: string
  paused: boolean
  /** true = runs one at a time, each occupying the queue for its own Action's durationSeconds before the next starts; false = every run fires the instant it's enqueued, in parallel. */
  blocking: boolean
}

export const DEFAULT_ACTION_QUEUE_ID = 'default'

export const DEFAULT_ACTION_QUEUES: ActionQueueConfig[] = [
  { id: DEFAULT_ACTION_QUEUE_ID, name: 'Default', paused: false, blocking: false }
]

export const MIN_ACTION_DURATION_SECONDS = 1
export const MAX_ACTION_DURATION_SECONDS = 3600
const DEFAULT_ACTION_DURATION_SECONDS = 5

const ACTION_TRIGGER_TYPES: ActionTriggerType[] = ['command', 'customEvent']

export function normalizeActionConfig(value: unknown): ActionConfig {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<ActionConfig>
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : fallbackId('action'),
    name: typeof entry.name === 'string' ? entry.name : '',
    sceneUrlKey: typeof entry.sceneUrlKey === 'string' ? entry.sceneUrlKey : '',
    queueId: typeof entry.queueId === 'string' && entry.queueId ? entry.queueId : DEFAULT_ACTION_QUEUE_ID,
    durationSeconds:
      isFiniteNumber(entry.durationSeconds) && entry.durationSeconds > 0
        ? Math.min(MAX_ACTION_DURATION_SECONDS, Math.max(MIN_ACTION_DURATION_SECONDS, entry.durationSeconds))
        : DEFAULT_ACTION_DURATION_SECONDS,
    commandId: normalizeCommandId(entry.commandId, null),
    streamerbotEnabled: typeof entry.streamerbotEnabled === 'boolean' ? entry.streamerbotEnabled : false,
    streamerbotTriggerType:
      typeof entry.streamerbotTriggerType === 'string' &&
      ACTION_TRIGGER_TYPES.includes(entry.streamerbotTriggerType as ActionTriggerType)
        ? (entry.streamerbotTriggerType as ActionTriggerType)
        : 'customEvent',
    streamerbotCommandName: typeof entry.streamerbotCommandName === 'string' ? entry.streamerbotCommandName : '',
    streamerbotEventName: typeof entry.streamerbotEventName === 'string' ? entry.streamerbotEventName : ''
  }
}

export function normalizeActionConfigs(value: unknown): ActionConfig[] {
  return Array.isArray(value) ? value.map(normalizeActionConfig) : []
}

export function normalizeActionQueueConfig(value: unknown): ActionQueueConfig {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<ActionQueueConfig>
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : fallbackId('queue'),
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name : 'Queue',
    paused: typeof entry.paused === 'boolean' ? entry.paused : false,
    blocking: typeof entry.blocking === 'boolean' ? entry.blocking : false
  }
}

/** Falls back to DEFAULT_ACTION_QUEUES (rather than an empty list) so there's always at least one queue for an Action to land in — same "never end up with zero" reasoning QueuesPage relies on to keep a Default queue undeletable. */
export function normalizeActionQueueConfigs(value: unknown): ActionQueueConfig[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_ACTION_QUEUES
  return value.map(normalizeActionQueueConfig)
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
