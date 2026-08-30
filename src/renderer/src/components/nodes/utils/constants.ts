import { ALERT_TYPES_BY_PLATFORM, type AlertPlatform } from '@shared/types'

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

export const ALERT_PLATFORM_LABELS: Record<AlertPlatform, string> = { twitch: 'Twitch', youtube: 'YouTube' }

/** Falls back to inferring platform from a saved alertType (pre-platform-field scenes) rather than always defaulting to 'twitch' — otherwise loading an old YouTube-typed Event node would show a Sub-type list that doesn't contain its own saved value. */
export function inferAlertPlatform(data: Record<string, unknown>): AlertPlatform {
  if (data.platform === 'twitch' || data.platform === 'youtube') return data.platform
  const savedType = data.alertType as string
  return (ALERT_TYPES_BY_PLATFORM.youtube as string[]).includes(savedType) ? 'youtube' : 'twitch'
}
export const TASK_ACTIONS = ['show', 'hide', 'update'] as const
/** Maps 1:1 onto CSS `overflow-x`/`overflow-y` — see OverflowNode. 'auto' shows a scrollbar only once content actually exceeds the box (from a wired Size, most often); 'scroll' always reserves one. */
export const OVERFLOW_MODES = ['visible', 'hidden', 'auto', 'scroll'] as const
/** Which way an Overflow node's Auto-scroll animates its content — see overflowAutoScroll in overlays/sceneUtils.tsx. 'up'/'down' pick the vertical keyframe, 'left'/'right' the horizontal one; 'down'/'right' just play the same keyframe in reverse. */
export const SCROLL_DIRECTIONS = ['up', 'down', 'left', 'right'] as const
