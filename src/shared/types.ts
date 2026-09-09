import type { Node, Edge } from '@xyflow/react'
import type { CanvasConfig } from './canvasConfig'

export interface NowPlayingPayload {
  source: 'spotify' | 'windows'
  title: string
  artist: string
  albumArt?: string
  isPlaying: boolean
}

/** One capture device's latest frequency-band levels (0-255 each, fixed resolution — see AUDIO_LEVELS_BAND_COUNT in main/audioCapture.ts) — broadcast at the capture window's own frame rate via OverlayServer.pushAudioLevels, consumed directly by overlays/custom-render.js's updateEqualizerBars (an Equalizer node's own `barCount` resamples this down/up as needed, see applyEqualizerLevels). */
export interface AudioLevelsPayload {
  deviceId: string
  bands: number[]
}

export type AlertType = 'subscription' | 'raid' | 'follow' | 'membership' | 'super-chat'

/** Every type a Twitch/YouTube alert can be — still meaningful without a standalone Alerts overlay: a custom overlay's Event node (see nodes/index.tsx EventNode) reacts to these directly. */
export const ALERT_TYPES: AlertType[] = ['subscription', 'raid', 'follow', 'membership', 'super-chat']

export type AlertPlatform = 'twitch' | 'youtube'

export const ALERT_PLATFORMS: AlertPlatform[] = ['twitch', 'youtube']

/** Which AlertType each platform can actually emit — see mapNotificationToAlert in integrations/twitch.ts (follow/subscription/raid) and the membership/super-chat plan in integrations/youtube.ts. No type is shared between platforms, so Event node's Sub-type options (see EventNode) are scoped to whichever platform its Type field picks. */
export const ALERT_TYPES_BY_PLATFORM: Record<AlertPlatform, AlertType[]> = {
  twitch: ['subscription', 'raid', 'follow'],
  youtube: ['membership', 'super-chat']
}

export interface CustomOverlay {
  id: string
  name: string
  /** Unique key used to build this scene's OBS overlay URL — editable independently of `id`/`name`. */
  urlKey: string
  nodes: Node[]
  edges: Edge[]
  /** Sidebar grouping only — id of the OverlayFolder this scene is filed under. Omitted (or absent from folders.json) means "ungrouped". */
  folderId?: string
  /** Lucide icon name shown in the sidebar for this scene (see overlay-icons.ts). Omitted falls back to the default Workflow icon. */
  icon?: string
  /** Per-scene override of the Scene Builder preview's reference canvas (see shared/canvasConfig.ts). Omitted falls back to the app-wide default from Settings → Canvas. */
  canvasConfig?: CanvasConfig
}

/** Purely a sidebar organization concept — folders group CustomOverlay entries in the Overlays nav section, nothing more (no effect on OBS URLs or the scene graph). */
export interface OverlayFolder {
  id: string
  name: string
}

export interface AlertPayload {
  source: 'twitch' | 'youtube'
  type: AlertType
  user: string
  message?: string
  amount?: number
}

/** Provably-fair random roll: `hash` (SHA-256 of `seed`) is published at 'committed' — before `seed`/`number` are known — so viewers can verify afterwards that the result wasn't changed after the fact. See RandomEngine. */
export interface RandomStatePayload {
  phase: 'idle' | 'committed' | 'revealed'
  hash: string | null
  numbers: number[] | null
  seed: string | null
  min: number
  max: number
  count: number
}

export type RouletteEntrantSource = 'chat' | 'points' | 'manual'

export interface RouletteEntrant {
  id: string
  name: string
  source: RouletteEntrantSource
  /** Entries this viewer holds in the round. Chat/manual entries stay at 1; each points-reward redemption adds another, so repeat redemptions buy better odds. */
  weight: number
}

export interface RouletteStatePayload {
  phase: 'idle' | 'collecting' | 'spinning' | 'result'
  entrants: RouletteEntrant[]
  /** epoch ms the 'collecting' phase ends at; null outside that phase. */
  endsAt: number | null
  winner: RouletteEntrant | null
  /** SHA-256(seed), published as soon as the round starts — before any entrant joins. */
  hash: string | null
  /** Disclosed once collecting ends (spinning/result phases); null while still collecting. */
  seed: string | null
}

/**
 * A Variable's own data type — decides both how its `value` is edited (a
 * text field, a checkbox, a number field) and how it's coerced on every
 * write (see coerceVariableValue in components/nodes/utils/constants.ts),
 * so a value can never silently drift out of the shape its type promises
 * (a 'boolean' variable can't end up holding "3.5", say).
 */
export type VariableDataType = 'string' | 'boolean' | 'int' | 'float'

/** The actual runtime shape a `VariableDataType` resolves to. */
export type VariableValue = string | number | boolean

/**
 * One registered global variable — shared across every scene, unlike a
 * local Variable node's own `data.value` (see PROGRESS_SOCKETS/VariableNode's
 * own doc comments in components/nodes). Managed on the "Данные →
 * Переменные" page (pages/data/VariablesPage.tsx), referenced from a Variable
 * node via `data.globalId` once `data.scope === 'global'`. `name` doubles as
 * its `{name}` placeholder token — sanitized to `\w+` (see
 * sanitizePlaceholderName in components/nodes/utils/constants.ts) so it's
 * always a valid template placeholder. `type` pins `value`'s own shape (see
 * VariableDataType's own doc comment) — a variable created before typed
 * variables existed has no `type` yet, so every reader treats a missing one
 * as 'float' (its `value` was always a plain number back then).
 */
export interface GlobalVariable {
  id: string
  name: string
  type: VariableDataType
  value: VariableValue
}

export interface ChatMessagePayload {
  source: 'twitch'
  user: string
  /** Twitch numeric user id — used to check follower/subscriber status for roulette's entry mode (see isEligibleForRoulette in index.ts); neither status can be read off the message itself for free. */
  userId: string
  text: string
}

export interface PointsRedemptionPayload {
  source: 'twitch'
  user: string
  /** Twitch numeric user id — same role as ChatMessagePayload's, for the same entry-mode check on a points-based entry. */
  userId: string
  rewardId: string
  rewardTitle: string
}

export interface TwitchCustomReward {
  id: string
  title: string
}

/** One Streamer.bot global variable, as returned by the WS API's GetGlobal(s) request — read-only from OBScure's side (Streamer.bot's WS API has no SetGlobal request; writing one requires triggering a Streamer.bot Action that sets it internally, out of scope here). `lastWrite` is an ISO timestamp string Streamer.bot stamps on every write, kept only for parity with the wire shape (not surfaced anywhere yet). */
export interface StreamerBotGlobalVariable {
  name: string
  value: string | number | boolean | null
  lastWrite: string
}

/**
 * A normalized Streamer.bot push-event relevant to the Action integration —
 * either a Command.Triggered (chat command run through Streamer.bot's own
 * command system) or a Custom.Event (raised by a Streamer.bot Action's
 * "Raise Event" sub-action). Emitted by StreamerBotIntegration regardless of
 * whether anything is listening for it; matched against every stored
 * ActionConfig in main/index.ts, same separation as TwitchIntegration's own
 * chat-message/points-redemption events being matched against
 * RouletteConfig there instead of inside the integration itself.
 */
export interface StreamerBotTriggerPayload {
  kind: 'command' | 'customEvent'
  /** Command.Triggered's own `command` field (the trigger phrase, e.g. "!action"); null for a customEvent trigger. */
  command: string | null
  /** Custom.Event's own `eventName` field; null for a command trigger. */
  eventName: string | null
  /** Custom.Event's own `args` object; null for a command trigger or when the action raised no args. */
  args: Record<string, unknown> | null
  /** Resolved display name for a command trigger (Command.Triggered's user.display/user.name) — null for a customEvent trigger. */
  user: string | null
}

/**
 * Raised whenever a chat message matches ANY registered CommandDef (see
 * shared/eventsConfig.ts) and the sender is eligible per its own entryTypes
 * — regardless of whether Roulette or an Action also happens to reference
 * that same command. Consumed by a Scene's own Event node (kind: 'command'
 * — see EventNode.tsx), the scene-graph equivalent of an 'alert': matched
 * against `commandId` in overlays/custom.html's handleCommandTriggered,
 * mirroring how a real 'alert' is matched against `type` in handleAlert.
 */
export interface CommandTriggeredPayload {
  commandId: string
  user: string
}

/**
 * One ActionQueueConfig (see shared/eventsConfig.ts) merged with its live
 * pendingCount/completedCount — what QueuesPage actually renders, same shape
 * as Streamer.bot's own Queues table. Broadcast on every enqueue/start/
 * complete/pause/blocking-toggle by ActionQueueEngine — see its own doc
 * comment (src/main/actionQueueEngine.ts).
 */
export interface ActionQueueRuntimeState {
  id: string
  name: string
  paused: boolean
  blocking: boolean
  /** Runs enqueued but not yet finished (including whichever one a Blocking queue currently has running). */
  pendingCount: number
  /** Runs finished since launch/profile switch — never persisted, never decremented except via an explicit reset. */
  completedCount: number
}

export interface AppEvents {
  'now-playing': NowPlayingPayload
  /** Broadcast at the capture window's own frame rate for every audio-input device referenced by an audioSource node in any saved scene — see OverlayServer.pushAudioLevels/main/audioCapture.ts. */
  'audio-levels': AudioLevelsPayload
  alert: AlertPayload
  'random-state': RandomStatePayload
  'roulette-state': RouletteStatePayload
  'chat-message': ChatMessagePayload
  'points-redemption': PointsRedemptionPayload
  'custom-overlay-config': CustomOverlay[]
  /** Tells connected custom-scene pages to actually play: replay entrance animations and fire any non-repeating Background FX once. Sent by the Scene Builder's Test button — see OverlayServer.testCustomOverlay. */
  'custom-overlay-trigger': { urlKey: string }
  'integration-status': { key: IntegrationKey; status: string }
  /** Full registry, broadcast on every add/edit/delete from the "Данные → Переменные" page — see OverlayServer.setGlobalVariables. Lets an already-open OBS Browser Source pick up a value change instantly, same live pattern as roulette/random state. */
  'global-variables': GlobalVariable[]
  /** Broadcast on every periodic Twitch stats poll while connected (see TwitchIntegration's own poll/OverlayServer.pushTwitchStats) — feeds a scope='integration' Variable node's live follower/subscriber/viewer count, same live pattern as global-variables. Null once Twitch disconnects or a profile switch tears the integration down. */
  'twitch-stats': TwitchChannelStats | null
  /** Broadcast on every periodic GetGlobals poll while Streamer.bot is connected (see StreamerBotIntegration's own polling/OverlayServer.setStreamerBotGlobals), and as an empty array on disconnect/profile switch — feeds a scope='integration', integration='streamerbot' Variable node, same live pattern as 'twitch-stats'. */
  'streamerbot-globals': StreamerBotGlobalVariable[]
  /** Raised on every Command.Triggered/Custom.Event push from Streamer.bot, regardless of whether the Actions feature (or anything else) is listening — see StreamerBotTriggerPayload's own doc comment. */
  'streamerbot-trigger': StreamerBotTriggerPayload
  /** Broadcast on every Action enqueue/start/complete and every queue create/rename/delete/pause/blocking-toggle — see ActionQueueEngine. */
  'action-queues-state': ActionQueueRuntimeState[]
  /** Raised on every eligible chat-command match against the Commands registry — see CommandTriggeredPayload's own doc comment. */
  'command-triggered': CommandTriggeredPayload
}

/**
 * One entry in the live Event Log (Данные → Журнал событий) — a raw record
 * of a discrete AppEvents tick, in the same "watch everything happen" spirit
 * as Streamer.bot's own Events panel. `event` is loosely typed as `string`
 * rather than `keyof AppEvents` since it crosses the IPC boundary (main →
 * renderer) where the union is erased anyway; see EventLog (main/eventLog.ts)
 * for which AppEvents keys are actually tapped.
 */
export interface EventLogEntry {
  id: string
  timestamp: number
  event: string
  payload: unknown
}

export interface OverlayAddress {
  host: string
  port: number
}

/** Custom overlays (Scene Builder scenes) are the only overlay type served over HTTP/OBS Browser Source now — see OverlayServer. */
export interface OverlayUrls extends OverlayAddress {
  /** Base URL a custom scene's Browser Source is built from as `${customBase}/${urlKey}.html` — see OverlayServer.handleRequest. */
  customBase: string
}

export type IntegrationKey = 'spotify' | 'windowsMedia' | 'twitch' | 'youtube' | 'streamerbot' | 'obs'
export type IntegrationsStatusMap = Record<IntegrationKey, string>

/** Plain (non-secret) config keys editable from the Integrations settings pages. */
export type SettingKey =
  | 'spotify.clientId'
  | 'windowsMedia.enabled'
  | 'twitch.clientId'
  | 'youtube.clientId'
  | 'youtube.clientSecret'
  | 'streamerbot.host'
  | 'streamerbot.port'
  | 'streamerbot.endpoint'
  | 'streamerbot.password'
  | 'obs.host'
  | 'obs.port'
  | 'obs.password'
  | 'overlay.host'
  | 'overlay.port'
  | 'customOverlays'
  | 'customOverlayFolders'
  | 'customLocales'
  | 'globalVariables'
  | 'app.minimizeToTray'

export interface ConnectResult {
  ok: boolean
  error?: string
}

/**
 * Channel stats shown on the dashboard's Twitch card. Only fields Helix
 * actually exposes — Twitch's own creator dashboard also shows things like
 * average viewers, but that comes from private analytics with no public API,
 * so it's deliberately not modeled here.
 */
export interface TwitchChannelStats {
  isLive: boolean
  viewerCount: number | null
  title: string | null
  gameName: string | null
  startedAt: string | null
  followerCount: number | null
  subscriberCount: number | null
}

/** Auto-update state pushed from src/main/updater.ts. 'unsupported' covers dev runs and the portable build, which has no install path for electron-updater to update in place. */
export type AppUpdaterStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'not-available' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  | { state: 'unsupported' }

/** One GitHub release's notes, as shown in the "what's new" dialog (src/main/whatsNew.ts). */
export interface WhatsNewEntry {
  version: string
  /** Commit subject lines between this release and the one before it (merge commits and the release's own version-bump commit filtered out) — built from git history rather than GitHub's PR-based --generate-notes, since this project pushes directly to main. */
  notes: string[]
}

/** Computed once per launch: every release between the version this profile last saw (exclusive) and the one now running (inclusive), newest first. Null means there's nothing to show — first run, no version change since last launch, or the GitHub fetch failed. */
export interface WhatsNewPayload {
  fromVersion: string
  toVersion: string
  entries: WhatsNewEntry[]
}
