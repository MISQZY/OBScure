import { Node, Edge } from '@xyflow/react'

/**
 * A brand-new scene starts with one working example instead of a blank
 * canvas: Text wired straight into Scene. Scene is the single output/sink —
 * see SceneNode's own doc comment in components/nodes — so this both shows
 * newcomers the pattern (connect content → Scene) and means the scene
 * already renders something the moment it's created.
 */
export const defaultNodes: Node[] = [
  { id: 'scene', type: 'scene', position: { x: 520, y: 140 }, deletable: false, data: {} },
  { id: '1', type: 'text', position: { x: 200, y: 140 }, data: { text: 'Scene Start' } }
]
export const defaultEdges: Edge[] = [{ id: 'e-1-scene', source: '1', target: 'scene' }]

/**
 * Every node type available in the editor, grouped by what it does in the
 * graph (see the node-direction doc comment in components/nodes/index.tsx):
 * Content/Layout feed forward toward Scene, Style/Effects modify whatever
 * they're wired into, Live Data documents an external signal feed, Tools
 * surfaces an app-level Tool's (Random/Roulette, see shared/eventsConfig.ts —
 * "Инструменты") live state. Together they cover the real overlay config
 * shapes (shared/overlayConfig.ts / shared/eventsConfig.ts) so any existing
 * scene (now playing, an alert type, random, roulette) can be rebuilt from
 * these. `scene` itself isn't listed — one is created automatically and
 * can't be deleted, so there's never a second to add.
 */
export const NODE_PALETTE: { type: string; label: string; group: string }[] = [
  { type: 'text', label: 'Text', group: 'Content' },
  { type: 'image', label: 'Image', group: 'Content' },
  { type: 'video', label: 'Video', group: 'Content' },
  { type: 'progress', label: 'Progress Bar', group: 'Content' },
  { type: 'box', label: 'Shape', group: 'Content' },
  { type: 'group', label: 'Group', group: 'Content' },
  { type: 'randomPick', label: 'Random Pick', group: 'Content' },
  // Matches the Transform socket's own `accepts` list (see MODIFIER_SOCKETS
  // in components/nodes/index.tsx) — these three are exactly what a Text/
  // Image/Video/Box/Task's single Transform input now takes.
  { type: 'position', label: 'Position', group: 'Transform' },
  { type: 'size', label: 'Size', group: 'Transform' },
  { type: 'transform', label: 'Transform', group: 'Transform' },
  // Matches the Style socket's own `accepts` list.
  { type: 'opacity', label: 'Opacity', group: 'Style' },
  { type: 'shadow', label: 'Shadow', group: 'Style' },
  { type: 'animation', label: 'Animation', group: 'Style' },
  { type: 'hide', label: 'Hide', group: 'Style' },
  { type: 'overflow', label: 'Overflow', group: 'Style' },
  // Matches Box/Scene's own Layout socket (formerly labeled "Ordering") —
  // the only node type it accepts.
  { type: 'ordering', label: 'Ordering', group: 'Layout' },
  { type: 'start', label: 'Start', group: 'Process' },
  { type: 'task', label: 'Task', group: 'Process' },
  { type: 'wait', label: 'Wait', group: 'Process' },
  { type: 'condition', label: 'Condition', group: 'Process' },
  { type: 'end', label: 'End', group: 'Process' },
  // Self-contained one-shot/ambient accessories — each has its own config
  // and a single output, wired into Start or Scene to activate alongside a
  // trigger (see TimerNode's own doc comment for how Timer specifically
  // differs from Wait: this is the Event+Timer→Scene single show/hide
  // model, not a Process step).
  { type: 'sound', label: 'Sound', group: 'Effects' },
  { type: 'timer', label: 'Timer', group: 'Effects' },
  { type: 'backgroundAnimation', label: 'Background FX', group: 'Effects' },
  // External live signal sources — Event matches an incoming alert,
  // Audio Player reads the current Spotify/Windows Media track. Neither
  // has state living outside the node itself. Clock isn't "external" the
  // same way, but shares the same shape (a data source with no visual
  // presence of its own — wire its Content output into a Text node's own
  // Content socket for a {time} placeholder, see CLOCK_OUTPUTS' own doc
  // comment in components/nodes/constants.ts).
  { type: 'event', label: 'Event', group: 'Live Data' },
  { type: 'audioPlayer', label: 'Audio Player', group: 'Live Data' },
  { type: 'clock', label: 'Clock', group: 'Live Data' },
  // Random/Roulette aren't self-contained nodes — placing one only
  // surfaces the live state of the matching app-level Tool (see
  // RandomToolPage/RouletteToolPage), min/max/count/command/entryMode/etc.
  // all live on that Tool's own settings, not on this node.
  { type: 'randomSource', label: 'Random', group: 'Tools' },
  { type: 'rouletteSource', label: 'Roulette', group: 'Tools' },
  // A manual named number, no live source wired to it yet — mainly for
  // Progress Bar's own Current/Target sockets (see PROGRESS_SOCKETS'
  // doc comment in components/nodes/constants.ts) until a real live-stat
  // feed exists to wire in instead.
  { type: 'variable', label: 'Variable', group: 'Data' },
  { type: 'frame', label: 'Layout Frame', group: 'Utils' }
]
export const PALETTE_GROUPS = [...new Set(NODE_PALETTE.map((entry) => entry.group))]

/** Drag-to-resize bounds (px) for the live preview panel — see usePreviewResize. */
export const MIN_PREVIEW_WIDTH = 160
export const MAX_PREVIEW_WIDTH = 720
export const DEFAULT_PREVIEW_WIDTH = 320
/** localStorage key for the preview's remembered width — same 'obscure:*' convention as ThemeProvider/I18nProvider's own persisted preferences. */
export const PREVIEW_WIDTH_STORAGE_KEY = 'obscure:sceneBuilderPreviewWidth'
export const LEGACY_PREVIEW_WIDTH_STORAGE_KEY = 'maddoner:sceneBuilderPreviewWidth'
