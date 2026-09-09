import type { ComponentType } from 'react'
import type { NodeProps } from '@xyflow/react'
import { ALERT_TYPES_BY_PLATFORM } from '@shared/types'

export * from './constants'
export * from './utils'

import type { InputSocket, OutputSocket, NodeCategory } from './constants'
import {
  SCENE_SOCKETS,
  TEXT_SOCKETS,
  TEXT_OUTPUTS,
  BOX_SOCKETS,
  BOX_OUTPUTS,
  RANDOM_PICK_SOCKETS,
  IMAGE_SOCKETS,
  IMAGE_OUTPUTS,
  VIDEO_SOCKETS,
  VIDEO_OUTPUTS,
  PROGRESS_SOCKETS,
  PROGRESS_OUTPUTS,
  EQUALIZER_SOCKETS,
  EQUALIZER_OUTPUTS,
  AUDIO_SOURCE_SOCKETS,
  AUDIO_SOURCE_OUTPUTS,
  CLOCK_OUTPUTS,
  BACKGROUND_FX_SOCKETS,
  RANDOM_OUTPUTS,
  RANDOM_WIDGET_SOCKETS,
  RANDOM_WIDGET_OUTPUTS,
  ROULETTE_OUTPUTS,
  ROULETTE_WIDGET_SOCKETS,
  ROULETTE_WIDGET_OUTPUTS,
  ROULETTE_ENTRANTS_SOCKETS,
  ROULETTE_ENTRANTS_OUTPUTS,
  AUDIO_PLAYER_OUTPUTS,
  START_SOCKETS,
  TASK_SOCKETS,
  CONDITION_OUTPUTS
} from './constants'

import { SceneNode } from './SceneNode'
import { TransformNode } from './TransformNode'
import { PositionNode } from './PositionNode'
import { SizeNode } from './SizeNode'
import { OpacityNode } from './OpacityNode'
import { ShadowNode } from './ShadowNode'
import { OverflowNode } from './OverflowNode'
import { SpacingNode } from './SpacingNode'
import { TextNode } from './TextNode'
import { TimerNode } from './TimerNode'
import { AnimationNode } from './AnimationNode'
import { BoxNode } from './BoxNode'
import { GroupNode } from './GroupNode'
import { RandomPickNode } from './RandomPickNode'
import { FrameNode } from './FrameNode'
import { ImageNode } from './ImageNode'
import { VideoNode } from './VideoNode'
import { ProgressNode } from './ProgressNode'
import { EqualizerNode } from './EqualizerNode'
import { AudioSourceNode } from './AudioSourceNode'
import { ClockNode } from './ClockNode'
import { VariableNode } from './VariableNode'
import { BackgroundAnimationNode } from './BackgroundAnimationNode'
import { SoundNode } from './SoundNode'
import { EventNode } from './EventNode'
import { RandomSourceNode } from './RandomSourceNode'
import { RandomWidgetNode } from './RandomWidgetNode'
import { RouletteSourceNode } from './RouletteSourceNode'
import { RouletteWidgetNode } from './RouletteWidgetNode'
import { RouletteEntrantsNode } from './RouletteEntrantsNode'
import { AudioPlayerNode } from './AudioPlayerNode'
import { OrderingNode } from './OrderingNode'
import { HideNode } from './HideNode'
import { StartNode } from './StartNode'
import { TaskNode } from './TaskNode'
import { WaitNode } from './WaitNode'
import { ConditionNode } from './ConditionNode'
import { EndNode } from './EndNode'

/**
 * One node type's complete registration — component, canvas category tint,
 * input/output sockets, default `data`, and (for the subset a user can drag
 * onto the canvas) its Add Node palette label/group — replacing what used to
 * be six hand-kept-in-sync lists (NODE_SOCKETS/NODE_OUTPUTS/NODE_CATEGORY/
 * NODE_DEFAULTS in constants.ts, this file's own `nodeTypes`, and NODE_PALETTE
 * in pages/overlays/sceneBuilderConstants.ts). Adding a new node type is now
 * one entry in NODE_DEFINITIONS below instead of up to six separate edits.
 * `sockets`/`outputSockets` are left `undefined` (not `[]`) for a type with
 * none — `NODE_SOCKETS`/`NODE_OUTPUTS` below only include a type when it
 * actually specifies one, matching the exact shape the old hand-written
 * Records had. This distinction is load-bearing: isValidConnection in
 * hooks/useSceneGraph.ts does `if (outputSockets)` — `[]` is truthy, so a
 * type with no real output-socket list would wrongly be forced through the
 * "must match a specific feeds entry" branch instead of falling back to a
 * plain generic-output connection.
 *
 * `paletteLabel`/`paletteGroup` are likewise left `undefined` for a type
 * that isn't directly placeable from the palette at all — `scene` (created
 * automatically, never a second one to add) and the auto-paired widget/
 * entrants nodes a Random/Roulette source creates alongside itself (see
 * addNode's own doc comment in hooks/useSceneGraph.ts) — `NODE_PALETTE`
 * below only includes a type when it specifies both. **The declaration order
 * of NODE_DEFINITIONS below IS the Add Node panel's own group/item order**
 * (`PALETTE_GROUPS` is first-occurrence order over the derived array, and
 * `NODE_PALETTE`'s own array order is what each group's item list renders
 * in) — reordering entries here reorders that panel, so keep same-group
 * types adjacent and don't reshuffle without meaning to.
 */
class NodeDefinition {
  readonly component: ComponentType<NodeProps>
  readonly category: NodeCategory
  readonly sockets?: InputSocket[]
  readonly outputSockets?: OutputSocket[]
  readonly defaults: Record<string, unknown>
  readonly paletteLabel?: string
  readonly paletteGroup?: string

  constructor(opts: {
    component: ComponentType<NodeProps>
    category: NodeCategory
    sockets?: InputSocket[]
    outputSockets?: OutputSocket[]
    defaults?: Record<string, unknown>
    paletteLabel?: string
    paletteGroup?: string
  }) {
    this.component = opts.component
    this.category = opts.category
    this.sockets = opts.sockets
    this.outputSockets = opts.outputSockets
    this.defaults = opts.defaults ?? {}
    this.paletteLabel = opts.paletteLabel
    this.paletteGroup = opts.paletteGroup
  }
}

/**
 * Declaration order = the Add Node panel's own group/item order (see
 * NodeDefinition's own doc comment above) — grouped here exactly the way
 * NODE_PALETTE used to be hand-grouped in pages/overlays/sceneBuilderConstants.ts:
 * Content feeds forward toward Scene; Transform/Style/Layout each modify
 * whatever they're wired into, split by CONCERN rather than by which
 * underlying socket they happen to share (see MODIFIER_SOCKETS in
 * constants.ts) — Transform is geometry (where/how big/rotated), Style is
 * look-or-visibility (opacity/shadow/animation/hide), Layout is box model
 * (spacing/clipping/child arrangement); Effects are self-contained one-shot/
 * ambient accessories wired into Start/Scene instead of into a component's
 * own modifier socket; Live Data documents an external signal feed; Tools
 * surfaces an app-level Tool's (Random/Roulette, see shared/eventsConfig.ts
 * — "Инструменты") live state, each immediately followed here by its own
 * auto-paired widget/entrants node(s) (no `paletteLabel` of their own — see
 * addNode's own doc comment in hooks/useSceneGraph.ts for why those are
 * never placed by hand). `scene` has no `paletteLabel` either — one is
 * created automatically and can't be deleted, so there's never a second to
 * add.
 */
const NODE_DEFINITIONS: Record<string, NodeDefinition> = {
  scene: new NodeDefinition({ component: SceneNode, category: 'content', sockets: SCENE_SOCKETS }),
  text: new NodeDefinition({
    component: TextNode,
    category: 'content',
    sockets: TEXT_SOCKETS,
    outputSockets: TEXT_OUTPUTS,
    defaults: {
      text: '',
      color: '#ffffff',
      fontSize: 32,
      letterSpacing: 0,
      align: 'left',
      verticalAlign: 'top',
      bold: true,
      italic: false,
      outlineEnabled: false,
      outlineWidth: 2,
      outlineColor: '#000000',
      glowEnabled: false,
      glowType: 'outer',
      glowColor: '#ffffff',
      glowOpacity: 80,
      glowBlur: 12
    },
    paletteLabel: 'Text',
    paletteGroup: 'Content'
  }),
  image: new NodeDefinition({
    component: ImageNode,
    category: 'content',
    sockets: IMAGE_SOCKETS,
    outputSockets: IMAGE_OUTPUTS,
    defaults: { borderRadius: 8, borderEnabled: false, borderWidth: 2, borderColor: '#ffffff' },
    paletteLabel: 'Image',
    paletteGroup: 'Content'
  }),
  video: new NodeDefinition({
    component: VideoNode,
    category: 'content',
    sockets: VIDEO_SOCKETS,
    outputSockets: VIDEO_OUTPUTS,
    defaults: { muted: true, loop: true, borderRadius: 8, borderEnabled: false, borderWidth: 2, borderColor: '#ffffff' },
    paletteLabel: 'Video',
    paletteGroup: 'Content'
  }),
  // current/target/label all come from wired nodes now (see PROGRESS_SOCKETS'
  // own doc comment in constants.ts) — nothing left here but the bar's own look.
  progress: new NodeDefinition({
    component: ProgressNode,
    category: 'content',
    sockets: PROGRESS_SOCKETS,
    outputSockets: PROGRESS_OUTPUTS,
    defaults: { orientation: 'horizontal', barColor: '#8b5cf6', trackColor: '#3f3f46', thickness: 28, borderRadius: 14 },
    paletteLabel: 'Progress Bar',
    paletteGroup: 'Content'
  }),
  // barCount/style/color/speed/intensity/borderRadius are this node's own
  // look — no width/height of its own (see EqualizerNode's own doc comment):
  // it self-sizes at render time (240x80) until a Size node is wired into
  // its Transform socket, same convention as Image/Video/Progress.
  equalizer: new NodeDefinition({
    component: EqualizerNode,
    category: 'content',
    sockets: EQUALIZER_SOCKETS,
    outputSockets: EQUALIZER_OUTPUTS,
    defaults: { barCount: 24, style: 'bar', color: '#8b5cf6', speed: 1, intensity: 1, borderRadius: 8 },
    paletteLabel: 'Equalizer',
    paletteGroup: 'Content'
  }),
  // No padding of its own anymore — wire a Spacing node into its own Style
  // socket for that (see MODIFIER_SOCKETS' own doc comment in constants.ts);
  // a Box/Group saved before this change keeps whatever paddingX/paddingY it
  // already had as a fallback (see BoxView/buildBox) until a Spacing node
  // replaces it.
  box: new NodeDefinition({
    component: BoxNode,
    category: 'content',
    sockets: BOX_SOCKETS,
    outputSockets: BOX_OUTPUTS,
    defaults: { background: '#18181b', shape: 'rectangle', borderRadius: 10, borderEnabled: false, borderWidth: 2, borderColor: '#ffffff' },
    paletteLabel: 'Shape',
    paletteGroup: 'Content'
  }),
  group: new NodeDefinition({ component: GroupNode, category: 'content', sockets: BOX_SOCKETS, outputSockets: BOX_OUTPUTS, paletteLabel: 'Group', paletteGroup: 'Content' }),
  // customChance off: every connected Option has an equal shot — see
  // pickRandomVariant. `weights` keyed by the connected node's OWN id
  // (unset/invalid entries default to weight 1, same as an unset Roulette
  // entrant's own weight) rather than by anything positional, so reordering
  // or adding another wire never scrambles an already-tuned weight.
  randomPick: new NodeDefinition({
    component: RandomPickNode,
    category: 'content',
    sockets: RANDOM_PICK_SOCKETS,
    defaults: { customChance: false, weights: {} },
    paletteLabel: 'Random Pick',
    paletteGroup: 'Content'
  }),
  // Matches the Transform socket's own `accepts` list (see MODIFIER_SOCKETS
  // in constants.ts) — these three are exactly what a Text/Image/Video/Box/
  // Task's single Transform input now takes.
  position: new NodeDefinition({
    component: PositionNode,
    category: 'style',
    defaults: { mode: 'absolute', anchor: 'top-left', x: 0, y: 0 },
    paletteLabel: 'Position',
    paletteGroup: 'Transform'
  }),
  size: new NodeDefinition({ component: SizeNode, category: 'style', paletteLabel: 'Size', paletteGroup: 'Transform' }),
  transform: new NodeDefinition({
    component: TransformNode,
    category: 'style',
    defaults: { scaleX: 1, scaleY: 1, rotation: 0 },
    paletteLabel: 'Transform',
    paletteGroup: 'Transform'
  }),
  // All four wire into the same Style socket (see MODIFIER_SOCKETS in
  // constants.ts) alongside Overflow/Spacing below, but this palette
  // grouping is a separate, purely-organizational split by what each one
  // actually DOES rather than which socket it happens to share — Style here
  // means "how the target LOOKS, or whether it shows at all," never its own
  // size or position within its parent.
  opacity: new NodeDefinition({ component: OpacityNode, category: 'style', defaults: { value: 100 }, paletteLabel: 'Opacity', paletteGroup: 'Style' }),
  shadow: new NodeDefinition({
    component: ShadowNode,
    category: 'style',
    defaults: { color: '#000000', opacity: 60, blur: 6, offsetX: 0, offsetY: 2 },
    paletteLabel: 'Shadow',
    paletteGroup: 'Style'
  }),
  animation: new NodeDefinition({
    component: AnimationNode,
    category: 'style',
    defaults: { type: 'fade', duration: 500, subType: 'auto' },
    paletteLabel: 'Animation',
    paletteGroup: 'Style'
  }),
  hide: new NodeDefinition({ component: HideNode, category: 'style', defaults: { hidden: true }, paletteLabel: 'Hide', paletteGroup: 'Style' }),
  // Layout: how much ROOM the target takes/leaves and how it arranges or
  // clips what's inside it — Ordering controls a container's OWN children
  // (Box/Scene's dedicated Layout socket), Spacing/Overflow instead wire
  // into any target's own Style socket like the four above, but govern its
  // box model (padding/margin, clipping) rather than its look.
  ordering: new NodeDefinition({
    component: OrderingNode,
    category: 'style',
    defaults: { layout: 'vertical', direction: 'direct', gap: 8 },
    paletteLabel: 'Ordering',
    paletteGroup: 'Layout'
  }),
  spacing: new NodeDefinition({
    component: SpacingNode,
    category: 'style',
    defaults: { paddingX: 0, paddingY: 0, marginX: 0, marginY: 0 },
    paletteLabel: 'Spacing',
    paletteGroup: 'Layout'
  }),
  overflow: new NodeDefinition({
    component: OverflowNode,
    category: 'style',
    defaults: { overflowX: 'hidden', overflowY: 'hidden', autoScroll: false, scrollDirection: 'up', scrollSpeed: 40 },
    paletteLabel: 'Overflow',
    paletteGroup: 'Layout'
  }),
  start: new NodeDefinition({ component: StartNode, category: 'process', sockets: START_SOCKETS, paletteLabel: 'Start', paletteGroup: 'Process' }),
  task: new NodeDefinition({ component: TaskNode, category: 'process', sockets: TASK_SOCKETS, defaults: { action: 'show' }, paletteLabel: 'Task', paletteGroup: 'Process' }),
  wait: new NodeDefinition({ component: WaitNode, category: 'process', defaults: { delay: 1000 }, paletteLabel: 'Wait', paletteGroup: 'Process' }),
  // A sensible starting example (raid size over 10) rather than an empty
  // comparison — see evaluateCondition in pages/overlays/sceneUtils/graph.ts
  // for exactly how field/operator/value resolve against a live alert's
  // vars, and NUMERIC_CONDITION_OPERATORS/STRING_CONDITION_OPERATORS in
  // components/nodes/utils/constants.ts for which operators ConditionNode
  // offers per field.
  condition: new NodeDefinition({
    component: ConditionNode,
    category: 'process',
    outputSockets: CONDITION_OUTPUTS,
    defaults: { field: 'amount', operator: 'gt', value: '10' },
    paletteLabel: 'Condition',
    paletteGroup: 'Process'
  }),
  end: new NodeDefinition({ component: EndNode, category: 'process', paletteLabel: 'End', paletteGroup: 'Process' }),
  // Self-contained one-shot/ambient accessories — each has its own config
  // and a single output, wired into Start or Scene to activate alongside a
  // trigger (see TimerNode's own doc comment for how Timer specifically
  // differs from Wait: this is the Event+Timer→Scene single show/hide
  // model, not a Process step).
  sound: new NodeDefinition({ component: SoundNode, category: 'data', defaults: { soundId: 'none', volume: 1 }, paletteLabel: 'Sound', paletteGroup: 'Effects' }),
  timer: new NodeDefinition({ component: TimerNode, category: 'data', defaults: { delay: 1000 }, paletteLabel: 'Timer', paletteGroup: 'Effects' }),
  backgroundAnimation: new NodeDefinition({
    component: BackgroundAnimationNode,
    category: 'data',
    sockets: BACKGROUND_FX_SOCKETS,
    defaults: { type: 'none', color: '#18181b', speed: 1, repeat: false },
    paletteLabel: 'Background FX',
    paletteGroup: 'Effects'
  }),
  // External live signal sources — Event matches an incoming alert, Audio
  // Player reads the current Spotify/Windows Media track. Neither has state
  // living outside the node itself. Clock isn't "external" the same way, but
  // shares the same shape (a data source with no visual presence of its own
  // — wire its Content output into a Text node's own Content socket for a
  // {time} placeholder, see CLOCK_OUTPUTS' own doc comment).
  event: new NodeDefinition({
    component: EventNode,
    category: 'data',
    defaults: { kind: 'alert', platform: 'twitch', alertType: ALERT_TYPES_BY_PLATFORM.twitch[0] },
    paletteLabel: 'Event',
    paletteGroup: 'Live Data'
  }),
  audioPlayer: new NodeDefinition({ component: AudioPlayerNode, category: 'data', outputSockets: AUDIO_PLAYER_OUTPUTS, paletteLabel: 'Audio Player', paletteGroup: 'Live Data' }),
  // sourceKind 'device' (default): deviceId/deviceLabel are a real local
  // capture device (see AudioSourceNode.tsx). sourceKind 'obs': deviceId is
  // instead `obs:<inputName>` — a synthesized-from-loudness feed read from
  // OBS's own audio mixer (see main/integrations/obs), obsInputName kept
  // separately as the plain name for re-matching against a fresh OBS input
  // list. Either way `deviceId` is the one field the render pipeline
  // (buildEqualizer/applyEqualizerLevels) actually reads.
  audioSource: new NodeDefinition({
    component: AudioSourceNode,
    category: 'data',
    sockets: AUDIO_SOURCE_SOCKETS,
    outputSockets: AUDIO_SOURCE_OUTPUTS,
    defaults: { sourceKind: 'device', deviceId: '', deviceLabel: '', obsInputName: '' },
    paletteLabel: 'Audio Source',
    paletteGroup: 'Live Data'
  }),
  // Reads the system clock directly — no data wired in. format is free text
  // (see isValidClockFormat/formatClockDate in components/nodes/utils/
  // constants.ts). No styling fields anymore — wire its Content output into
  // a Text node and style THAT (see CLOCK_OUTPUTS' own doc comment).
  clock: new NodeDefinition({ component: ClockNode, category: 'data', outputSockets: CLOCK_OUTPUTS, defaults: { format: 'HH:mm:ss' }, paletteLabel: 'Clock', paletteGroup: 'Live Data' }),
  // Random/Roulette aren't self-contained nodes — placing one only surfaces
  // the live state of the matching app-level Tool (see RandomToolPage/
  // RouletteToolPage), min/max/count/command/entryMode/etc. all live on that
  // Tool's own settings, not on this node. Each is immediately followed by
  // its own auto-paired display node(s) — never placed by hand, no
  // `paletteLabel` of their own (see addNode's own doc comment in
  // hooks/useSceneGraph.ts).
  randomSource: new NodeDefinition({ component: RandomSourceNode, category: 'data', outputSockets: RANDOM_OUTPUTS, paletteLabel: 'Random', paletteGroup: 'Tools' }),
  randomWidget: new NodeDefinition({ component: RandomWidgetNode, category: 'content', sockets: RANDOM_WIDGET_SOCKETS, outputSockets: RANDOM_WIDGET_OUTPUTS }),
  rouletteSource: new NodeDefinition({ component: RouletteSourceNode, category: 'data', outputSockets: ROULETTE_OUTPUTS, paletteLabel: 'Roulette', paletteGroup: 'Tools' }),
  rouletteWidget: new NodeDefinition({ component: RouletteWidgetNode, category: 'content', sockets: ROULETTE_WIDGET_SOCKETS, outputSockets: ROULETTE_WIDGET_OUTPUTS }),
  // rowTemplate tokens: {name}/{chance}/{weight} — see rouletteEntrantRows'
  // own doc comment in overlays/sceneUtils.tsx. layout 'list' = one entrant
  // per line, 'inline' joins them with `separator` instead. No color/
  // fontSize/etc. here — those are whichever Text node this feeds into's own
  // fields (see ROULETTE_ENTRANTS_OUTPUTS' own doc comment in constants.ts).
  rouletteEntrants: new NodeDefinition({
    component: RouletteEntrantsNode,
    category: 'data',
    sockets: ROULETTE_ENTRANTS_SOCKETS,
    outputSockets: ROULETTE_ENTRANTS_OUTPUTS,
    defaults: { layout: 'list', rowTemplate: '{name}', sortByChance: false, separator: ', ' }
  }),
  // A manual named number, no live source wired to it yet — mainly for
  // Progress Bar's own Current/Target sockets (see PROGRESS_SOCKETS' own doc
  // comment in constants.ts) until a real live-stat feed exists to wire in
  // instead.
  // scope 'local' (default): name/value both live here, this node's own
  // placeholder token. scope 'global': name/value instead come from
  // whichever GlobalVariable `globalId` points at (registered on the
  // "Данные → Переменные" page). scope 'integration': value instead comes
  // live from whichever connected integration `integration` names — a
  // platform's numeric stat (whichever field `platformStat` picks) or a
  // Streamer.bot global variable (`streamerbotName`) — see VariableNode's
  // own doc comment.
  variable: new NodeDefinition({
    component: VariableNode,
    category: 'data',
    defaults: { scope: 'local', name: '', type: 'float', value: 0, globalId: null, integration: 'twitch', platformStat: 'followers', streamerbotName: '' },
    paletteLabel: 'Variable',
    paletteGroup: 'Data'
  }),
  frame: new NodeDefinition({
    component: FrameNode,
    category: 'utils',
    defaults: { collapsed: false, label: 'Layout Frame' },
    paletteLabel: 'Layout Frame',
    paletteGroup: 'Utils'
  })
}

export const nodeTypes: Record<string, ComponentType<NodeProps>> = Object.fromEntries(Object.entries(NODE_DEFINITIONS).map(([type, def]) => [type, def.component]))

/** Every node type's category, keyed by node `type` — see NODE_DEFINITIONS' own doc comment above. Used by BaseNode's own `category` prop's palette-matching color and the Add Node palette (SceneBuilderPage.tsx) to tint its group headers/buttons to match. */
export const NODE_CATEGORY: Record<string, NodeCategory> = Object.fromEntries(Object.entries(NODE_DEFINITIONS).map(([type, def]) => [type, def.category]))

/** Every node type's default `data`, keyed by node `type` — applied by addNode (hooks/useSceneGraph.ts) the moment a node is placed. Node types absent here have no fields of their own (Scene, Start, End, Size, ...) — Size's width/height default to `null` ("auto") anyway, the same as never having been set. */
export const NODE_DEFAULTS: Record<string, Record<string, unknown>> = Object.fromEntries(Object.entries(NODE_DEFINITIONS).map(([type, def]) => [type, def.defaults]))

/** Every node type's input sockets, keyed by node `type` — the single source of truth shared between BaseNode's rendering and isValidConnection in hooks/useSceneGraph.ts. Node types absent here have no sockets of their own (pure sources — Position/Animation/Event/... — or Wait/End, which only take the process `sequenceIn` row). Filtered to types that actually specify `sockets` — see NODE_DEFINITIONS' own doc comment for why an empty array isn't used instead. */
export const NODE_SOCKETS: Record<string, InputSocket[]> = Object.fromEntries(
  Object.entries(NODE_DEFINITIONS)
    .filter((entry): entry is [string, NodeDefinition & { sockets: InputSocket[] }] => entry[1].sockets != null)
    .map(([type, def]) => [type, def.sockets])
)

/** Every node type's OUTPUT sockets, keyed by node `type` — analogous to NODE_SOCKETS. Node types absent here (the large majority) render the single generic "output" handle unchanged. */
export const NODE_OUTPUTS: Record<string, OutputSocket[]> = Object.fromEntries(
  Object.entries(NODE_DEFINITIONS)
    .filter((entry): entry is [string, NodeDefinition & { outputSockets: OutputSocket[] }] => entry[1].outputSockets != null)
    .map(([type, def]) => [type, def.outputSockets])
)

/** Every node type directly placeable from the Add Node panel (pages/overlays/components/AddNodePalette.tsx), in the exact group/item order NODE_DEFINITIONS above declares them — see that const's own doc comment. Node types with no `paletteLabel` (Scene, and every auto-paired widget/entrants node) are omitted, same as the old hand-written NODE_PALETTE always excluded them. */
export const NODE_PALETTE: { type: string; label: string; group: string }[] = Object.entries(NODE_DEFINITIONS)
  .filter((entry): entry is [string, NodeDefinition & { paletteLabel: string; paletteGroup: string }] => entry[1].paletteLabel != null)
  .map(([type, def]) => ({ type, label: def.paletteLabel, group: def.paletteGroup }))

/** Display order for the Add Node panel's own group sections — first-occurrence order over NODE_PALETTE above. */
export const PALETTE_GROUPS = [...new Set(NODE_PALETTE.map((entry) => entry.group))]

export { SavedNodeDataProvider, useSavedNodeData } from './utils'
