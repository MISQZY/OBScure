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
 * Content/Layout feed forward toward Scene, Style/Behavior modify whatever
 * they're wired into, Data documents an event feed. Together they cover the
 * real overlay config shapes (shared/overlayConfig.ts / shared/eventsConfig.ts)
 * so any existing scene (now playing, an alert type, random, roulette) can be
 * rebuilt from these. `scene` itself isn't listed — one is created
 * automatically and can't be deleted, so there's never a second to add.
 */
export const NODE_PALETTE: { type: string; label: string; group: string }[] = [
  { type: 'text', label: 'Text', group: 'Content' },
  { type: 'image', label: 'Image', group: 'Content' },
  { type: 'video', label: 'Video', group: 'Content' },
  { type: 'box', label: 'Shape', group: 'Content' },
  { type: 'group', label: 'Group', group: 'Content' },
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
  // Matches Box/Scene's own Layout socket (formerly labeled "Ordering") —
  // the only node type it accepts.
  { type: 'ordering', label: 'Ordering', group: 'Layout' },
  { type: 'start', label: 'Start', group: 'Process' },
  { type: 'task', label: 'Task', group: 'Process' },
  { type: 'wait', label: 'Wait', group: 'Process' },
  { type: 'end', label: 'End', group: 'Process' },
  { type: 'sound', label: 'Sound', group: 'Behavior' },
  { type: 'timer', label: 'Timer', group: 'Behavior' },
  { type: 'backgroundAnimation', label: 'Background FX', group: 'Behavior' },
  { type: 'event', label: 'Event', group: 'Data' },
  { type: 'randomSource', label: 'Random', group: 'Data' },
  { type: 'rouletteSource', label: 'Roulette', group: 'Data' },
  { type: 'audioPlayer', label: 'Audio Player', group: 'Data' },
  { type: 'frame', label: 'Layout Frame', group: 'Utils' }
]
export const PALETTE_GROUPS = [...new Set(NODE_PALETTE.map((entry) => entry.group))]

/** Drag-to-resize bounds (px) for the live preview panel — see usePreviewResize. */
export const MIN_PREVIEW_WIDTH = 160
export const MAX_PREVIEW_WIDTH = 720
export const DEFAULT_PREVIEW_WIDTH = 320
/** localStorage key for the preview's remembered width — same 'maddoner:*' convention as ThemeProvider/I18nProvider's own persisted preferences. */
export const PREVIEW_WIDTH_STORAGE_KEY = 'maddoner:sceneBuilderPreviewWidth'
