import type { Node } from '@xyflow/react'
import { ALERT_TYPES_BY_PLATFORM, type AlertPlatform, type GlobalVariable, type TwitchChannelStats } from '@shared/types'

/**
 * `nodrag` is an @xyflow/react convention: without it, a click-drag inside
 * this element is captured as a node-move gesture instead of the browser's
 * normal text selection/interaction. `select-text` overrides the
 * `user-select: none` xyflow puts on .react-flow__node itself, which
 * otherwise blocks drag-selecting text even inside a nodrag input. Both are
 * on every interactive control in every node below.
 */
export const numberInputClass = 'nodrag select-text w-16 bg-muted px-1 py-0.5 rounded outline-none'
export const selectClass = 'nodrag select-text flex-1 min-w-0 bg-muted px-1 py-0.5 rounded outline-none'

export const textInputClass = 'nodrag select-text w-full h-6 bg-muted px-1 rounded outline-none'

/** Multi-line sibling of textInputClass, for Text's own Content field — starts at `rows={3}` (set on the element itself) and resize-y lets a longer caption grow past that instead of scrolling inside a fixed box. */
export const textAreaClass = 'nodrag select-text w-full bg-muted px-1 py-1 rounded outline-none resize-y'

/** Filled in from an Event node's real/simulated alert — see EventNode/interpolate. Read by useAvailablePlaceholders, which is what actually decides PlaceholderPicker's {} menu contents ('title'/'artist', the other half, are handled there together since Audio Player's Content wire always arms both at once — see that hook's own doc comment). */
export const EVENT_PLACEHOLDERS = ['user', 'amount', 'message', 'source'] as const

/** Sentinel for the "use the overlay page's own default font stack" option — NodeSelect can't take an empty/null value. */
export const SYSTEM_DEFAULT_FONT = '__default__'

/** 'auto' (default) plays entrance on a Task's 'show' action and exit on 'hide', same as before this field existed. 'in'/'out' pin the direction explicitly, overriding the Task's own action — see computeTaskState in SceneBuilderPage.tsx / overlays/custom.html. */
export const ANIMATION_SUB_TYPES = ['auto', 'in', 'out'] as const

/**
 * Corner treatment for a Box (see boxShapeStyle, shared by BoxView in
 * SceneBuilderPage.tsx / buildBox in overlays/custom.html): 'rectangle'
 * keeps the plain Radius field; the rest override it with a fixed
 * border-radius ('pill'/'circle') or a clip-path polygon
 * ('hexagon'/'diamond') — a Box already being a general-purpose
 * background+padding+children container, this is what makes it double as a
 * badge/avatar-frame/callout shape instead of needing a whole separate
 * "Shape" node type for what's really just one more corner style.
 */
export const BOX_SHAPE_IDS = ['rectangle', 'pill', 'circle', 'hexagon', 'diamond'] as const
export const EVENT_KINDS = ['alert', 'command'] as const

/**
 * How an Image node's picture fills its box (see ImageView in
 * SceneBuilderPage.tsx / buildImage in overlays/custom.html). 'cover'
 * (crop to fill, no distortion) is the default and was previously the only
 * option. The rest map straight onto CSS `object-fit`, except 'repeat',
 * which switches the element from an <img> to a tiled CSS background —
 * object-fit has no tiling keyword of its own.
 */
export const IMAGE_FIT_IDS = ['cover', 'contain', 'fill', 'none', 'repeat'] as const
export const IMAGE_FIT_LABELS: Record<(typeof IMAGE_FIT_IDS)[number], string> = {
  cover: 'Cover',
  contain: 'Contain',
  fill: 'Stretch',
  none: 'Original size',
  repeat: 'Repeat'
}

export const ALERT_PLATFORM_LABELS: Record<AlertPlatform, string> = { twitch: 'Twitch', youtube: 'YouTube' }

/** Falls back to inferring platform from a saved alertType (pre-platform-field scenes) rather than always defaulting to 'twitch' — otherwise loading an old YouTube-typed Event node would show a Sub-type list that doesn't contain its own saved value. */
export function inferAlertPlatform(data: Record<string, unknown>): AlertPlatform {
  if (data.platform === 'twitch' || data.platform === 'youtube') return data.platform
  const savedType = data.alertType as string
  return (ALERT_TYPES_BY_PLATFORM.youtube as string[]).includes(savedType) ? 'youtube' : 'twitch'
}
export const TASK_ACTIONS = ['show', 'hide', 'update'] as const

/** Same field vocabulary as EVENT_PLACEHOLDERS above — a Condition branches on the exact same {user}/{amount}/{message}/{source} an alert already exposes to templates, rather than inventing a second vocabulary. */
export const CONDITION_FIELDS = EVENT_PLACEHOLDERS
export const CONDITION_FIELD_LABELS: Record<(typeof EVENT_PLACEHOLDERS)[number], string> = {
  user: 'Username',
  amount: 'Amount',
  message: 'Message',
  source: 'Platform'
}

export type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'
/** Offered only for the 'amount' field (see ConditionNode) — comparing anything else numerically would just be NaN vs. NaN. */
export const NUMERIC_CONDITION_OPERATORS: ConditionOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']
/** Offered for user/message/source — every comparison here is case-insensitive substring/equality, see evaluateCondition in pages/overlays/sceneUtils/graph.ts. */
export const STRING_CONDITION_OPERATORS: ConditionOperator[] = ['eq', 'neq', 'contains']
export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: 'contains'
}
/** Which way an Overflow node's Auto-scroll animates its content — see overflowAutoScroll in overlays/sceneUtils.tsx. 'up'/'down' pick the vertical keyframe, 'left'/'right' the horizontal one; 'down'/'right' just play the same keyframe in reverse. */
export const SCROLL_DIRECTIONS = ['up', 'down', 'left', 'right'] as const

export const VARIABLE_SCOPES = ['local', 'global', 'platform'] as const

/**
 * Which platforms currently expose a live stats feed a scope='platform'
 * Variable node can read (see platformStatValue below) — the intersection
 * VariableNode's own Platform picker offers is THIS list ∩ whichever
 * platforms are actually connected right now (useIntegrationsStatus), same
 * "selection among connected platforms" the user sees. Only Twitch has a
 * feed today (TwitchIntegration's own pollStats/TwitchChannelStats) —
 * YouTube is a valid AlertPlatform elsewhere (EventNode's own alert
 * platform) but has no channel-stats fetch implemented yet (see
 * main/integrations/youtube.ts), so it's deliberately absent here rather
 * than offered as a picker option that would just always read 0.
 */
export const PLATFORM_STAT_SOURCES: AlertPlatform[] = ['twitch']

/** Every stat id a platform in PLATFORM_STAT_SOURCES can expose — read through platformStatValue below. Currently all Twitch, so all three; a future second source would only add to this list if its own fields don't already fit. */
export const PLATFORM_STAT_IDS = ['followers', 'subscribers', 'viewers'] as const
export const PLATFORM_STAT_LABELS: Record<(typeof PLATFORM_STAT_IDS)[number], string> = {
  followers: 'Followers',
  subscribers: 'Subscribers',
  viewers: 'Viewers'
}

/**
 * A Variable node's `data.name` (local scope) or a registered GlobalVariable's
 * own `name` (global scope) is also its `{name}` template placeholder — this
 * strips it down to `\w+` (letters/digits/underscore) so it's always a valid
 * match for interpolate()'s own `\{(\w+)\}` regex, regardless of what the
 * user actually typed. Applied live as the field is edited (VariableNode's
 * own Placeholder input, VariablesPage's own Name input), not just at
 * resolution time, so what's shown on screen always matches what actually
 * works when typed as `{name}` into a Text node.
 */
export function sanitizePlaceholderName(raw: string): string {
  return (raw || '').replace(/[^\w]/g, '').slice(0, 40)
}

/**
 * A Variable node's own resolved placeholder token, or null if it doesn't
 * have one yet (an empty local name, or scope=global with nothing picked/the
 * picked entry since deleted) — see sanitizePlaceholderName's own doc
 * comment. Mirrors variablePlaceholderName in overlays/custom-content-values.js.
 */
export function variablePlaceholderName(node: Node, globalVariables: GlobalVariable[]): string | null {
  if (node.data.scope === 'global') {
    const gv = globalVariables.find((v) => v.id === node.data.globalId)
    return gv ? sanitizePlaceholderName(gv.name) || null : null
  }
  const name = sanitizePlaceholderName((node.data.name as string) || '')
  return name || null
}

/**
 * A scope='platform' Variable node's own resolved numeric value — whichever
 * field of `twitchStats` its own `data.platformStat` picks, for whichever
 * platform `data.platform` names (see PLATFORM_STAT_SOURCES above) — 0 for
 * any platform with no live feed wired in here yet (only 'twitch' resolves
 * today; a future second source would get its own branch alongside it, same
 * as this one), or when the feed hasn't loaded (`twitchStats` null, or a
 * null field on TwitchChannelStats itself — see its own doc comment in
 * shared/types.ts) — same "unwired optional input" convention as every other
 * not-yet-resolved value in this graph. Mirrors platformStatValue in
 * overlays/custom-content-values.js.
 */
export function platformStatValue(platform: string, stat: string, twitchStats: TwitchChannelStats | null): number {
  if (platform !== 'twitch') return 0
  if (!twitchStats) return 0
  if (stat === 'subscribers') return twitchStats.subscriberCount ?? 0
  if (stat === 'viewers') return twitchStats.viewerCount ?? 0
  return twitchStats.followerCount ?? 0
}

/**
 * A Variable node's own resolved numeric value — the referenced
 * GlobalVariable's `value` once scope=global (0 if nothing's picked, or the
 * picked entry has since been deleted, same "unwired optional input"
 * convention as everywhere else in this graph), a live platform stat once
 * scope=platform (see platformStatValue above), otherwise this node's own
 * `data.value`. Mirrors variablePlaceholderValue in
 * overlays/custom-content-values.js.
 */
export function variablePlaceholderValue(node: Node, globalVariables: GlobalVariable[], twitchStats: TwitchChannelStats | null): number {
  if (node.data.scope === 'global') {
    const gv = globalVariables.find((v) => v.id === node.data.globalId)
    return gv ? gv.value : 0
  }
  if (node.data.scope === 'platform') {
    return platformStatValue((node.data.platform as string) || 'twitch', (node.data.platformStat as string) || 'followers', twitchStats)
  }
  const raw = node.data.value
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

/** A Progress Bar's fill axis — 'horizontal' fills left-to-right (width), 'vertical' fills bottom-to-top (height), same convention a volume/health bar reads by. */
export const PROGRESS_ORIENTATIONS = ['horizontal', 'vertical'] as const

/** Every token formatClockDate recognizes — YYYY/MM/DD/HH/hh/mm/ss/A only, no locale month/weekday names (no date-formatting library in this app). Shared by formatClockDate's own replace() and isValidClockFormat's own validation below, so the two can never drift apart. */
export const CLOCK_FORMAT_TOKENS = ['YYYY', 'MM', 'DD', 'HH', 'hh', 'mm', 'ss', 'A'] as const
const CLOCK_FORMAT_TOKEN_PATTERN = new RegExp(CLOCK_FORMAT_TOKENS.join('|'), 'g')

/**
 * Expands a Format string (ClockNode's own free-text field) against `date` —
 * mirrors formatClockDate in overlays/custom-builders.js. Any character NOT
 * part of a recognized token (see CLOCK_FORMAT_TOKENS) passes through
 * literally — a separator, a label, anything — same as every other
 * template-token system in this app (interpolate's own `{word}` tokens).
 */
export function formatClockDate(date: Date, format: string): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const hours24 = date.getHours()
  const hours12raw = hours24 % 12
  const hours12 = hours12raw === 0 ? 12 : hours12raw
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(hours24),
    hh: pad(hours12),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    A: hours24 < 12 ? 'AM' : 'PM'
  }
  return format.replace(CLOCK_FORMAT_TOKEN_PATTERN, (token) => tokens[token])
}

/**
 * Whether a Format string is worth keeping — non-empty AND contains at
 * least one real token (see CLOCK_FORMAT_TOKENS), so the clock actually
 * shows live time/date rather than silently rendering as static text (an
 * easy typo to make by hand now that this is free-text, not a fixed preset
 * picker). Deliberately permissive beyond that: literal text around/between
 * tokens ("Time: HH:mm", "HH'h'mm") is a legitimate format, not an error, so
 * this never requires the WHOLE string to be tokens-only. Purely a UI
 * warning (ClockNode still saves whatever's typed either way) — an "invalid"
 * format still renders, just as literal text with no live value in it,
 * exactly like formatClockDate already handles gracefully on its own.
 */
export function isValidClockFormat(format: string): boolean {
  const trimmed = format.trim()
  if (!trimmed) return false
  CLOCK_FORMAT_TOKEN_PATTERN.lastIndex = 0
  return CLOCK_FORMAT_TOKEN_PATTERN.test(trimmed)
}
