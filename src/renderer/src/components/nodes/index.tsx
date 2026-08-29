import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, NodeProps, useReactFlow, useStore } from '@xyflow/react'
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Bold,
  Italic,
  Upload,
  X,
  type LucideIcon
} from 'lucide-react'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { ANIMATION_IDS, BACKGROUND_ANIMATION_IDS } from '@shared/overlayConfig'
import { ALERT_TYPES } from '@shared/types'
import { SOUND_IDS } from '@shared/sounds'
import { cn } from '@/lib/utils'
import { MBadge } from '@/components/MBadge'
import { Checkbox } from '@/components/ui/checkbox'
import { useSystemFonts } from '@/hooks/use-system-fonts'
import { ScrollArea } from '@/components/ui/scroll-area'

import { HexColorPicker, HexColorInput } from 'react-colorful'

export const nodeTypes = {
  scene: SceneNode,
  transform: TransformNode,
  position: PositionNode,
  size: SizeNode,
  opacity: OpacityNode,
  shadow: ShadowNode,
  text: TextNode,
  timer: TimerNode,
  animation: AnimationNode,
  box: BoxNode,
  image: ImageNode,
  video: VideoNode,
  backgroundAnimation: BackgroundAnimationNode,
  sound: SoundNode,
  event: EventNode,
  randomSource: RandomSourceNode,
  rouletteSource: RouletteSourceNode,
  audioPlayer: AudioPlayerNode,
  ordering: OrderingNode,
  hide: HideNode,
  start: StartNode,
  task: TaskNode,
  wait: WaitNode,
  end: EndNode
}

/**
 * Everything flows left-to-right toward the single Scene node (the output —
 * see SceneNode): Text/Image feed into an optional Box, Box/Text/Image feed
 * into Scene, and "modifier" nodes (Position, Size, Transform, Animation,
 * Event, Sound, Timer, Hide, Display) have an output only, wired INTO
 * the node they affect. A node's own input sockets are therefore "what
 * modifies or contains me" — one dedicated, labeled socket per parameter
 * (Blender-style — see InputSocket/NODE_SOCKETS below), not a single shared
 * dot; its output is "what I contribute to". This is also what ScenePreview
 * (SceneBuilderPage.tsx) and overlays/custom.html walk to render the
 * scene — both resolve wiring by the connected node's `type`, never by
 * which specific socket it's plugged into, so which socket a wire lands on
 * is purely for the graph to read clearly, not something the interpreters
 * care about.
 *
 * Background FX is the one exception with BOTH: an output into Scene (to
 * activate it) and an input a Text node can feed (to caption
 * paratrooper/airdrop) — see BackgroundAnimationNode's own doc comment.
 *
 * Start/Task/Wait/End (the "Process" group) form a SECOND, separate kind of
 * edge in the same graph: sequence flow ("then"), not the data/composition
 * flow above ("feeds into"/"modifies"). Start → Task → Wait → ... → End
 * chains describe WHEN things happen — Wait accumulates elapsed time, each
 * Task shows/hides/updates ONE Text/Image/Box (wired into the Task's
 * `target` socket, same convention Box already uses for its own children)
 * with whatever Animation/Position/Size/Transform modifiers are wired into
 * that Task's OWN dedicated sockets for those. The structural graph above
 * still decides WHAT exists and how it's laid out/nested (a Task's target
 * must still reach Scene to render at all) — Start/Task/Wait/End only layer
 * timing on top. A Scene with a Start node reachable to an End ignores the
 * older Event+Timer→Scene single show/hide model entirely — see
 * buildProcessSchedule in SceneBuilderPage.tsx and overlays/custom.html.
 */

const RENDERABLE_TYPES = ['box', 'text', 'image', 'video']

/**
 * One labeled input socket on a node — Blender-style: a modifier that
 * overrides a specific parameter plugs into the socket for that parameter,
 * instead of every wire piling onto one shared dot. `accepts` is enforced
 * by isValidConnection in SceneBuilderPage.tsx (shared from NODE_SOCKETS
 * below so BaseNode's rendering and connection validation never drift).
 * `multi` (default false): a single-value socket auto-replaces its existing
 * wire when a new one is dropped on it (see onConnect in
 * SceneBuilderPage.tsx) — same behavior Blender uses for single-value
 * inputs. `multi: true` (Box's children, Scene's content) is a list: any
 * number of wires.
 */
export type InputSocket = {
  id: string
  label: string
  accepts: string[]
  /** Dot color only — reuses the CATEGORY_STYLES palette so a socket's color hints at what kind of node it accepts. */
  kind: 'content' | 'style' | 'data'
  multi?: boolean
}

const MODIFIER_SOCKETS: InputSocket[] = [
  { id: 'position', label: 'Position', accepts: ['position'], kind: 'style' },
  { id: 'size', label: 'Size', accepts: ['size'], kind: 'style' },
  { id: 'transform', label: 'Transform', accepts: ['transform'], kind: 'style' },
  { id: 'opacity', label: 'Opacity', accepts: ['opacity'], kind: 'style' },
  { id: 'shadow', label: 'Shadow', accepts: ['shadow'], kind: 'style' },
  { id: 'animation', label: 'Animation', accepts: ['animation'], kind: 'style' },
  { id: 'hide', label: 'Hide', accepts: ['hide'], kind: 'style' }
]

const TEXT_SOCKETS: InputSocket[] = MODIFIER_SOCKETS
const IMAGE_SOCKETS: InputSocket[] = MODIFIER_SOCKETS
const VIDEO_SOCKETS: InputSocket[] = MODIFIER_SOCKETS

const BOX_SOCKETS: InputSocket[] = [
  // Accepts 'box' too — a Box can nest another Box (see buildBox's recursion
  // in overlays/custom.html / BoxView's in SceneBuilderPage.tsx), so a card
  // can hold, say, a horizontal row of two sub-boxes instead of only flat
  // Text/Image children. A Box's own Ordering/Position/Transform/Animation
  // still apply to it normally once nested, same as at the top level.
  { id: 'children', label: 'Children', accepts: ['text', 'image', 'video', 'box'], kind: 'content', multi: true },
  ...MODIFIER_SOCKETS,
  { id: 'ordering', label: 'Ordering', accepts: ['ordering'], kind: 'style' }
]

const SCENE_SOCKETS: InputSocket[] = [
  { id: 'content', label: 'Content', accepts: ['box', 'text', 'image', 'video'], kind: 'content', multi: true },
  // kind 'data', not 'style' — Background FX is category 'data' (see its own
  // doc comment below), so this socket's dot/wire should match ITS color,
  // not the per-component style modifiers (Position/Animation/...) it has
  // nothing to do with.
  { id: 'backgroundFx', label: 'Background FX', accepts: ['backgroundAnimation'], kind: 'data' },
  { id: 'sound', label: 'Sound', accepts: ['sound'], kind: 'data' },
  { id: 'ordering', label: 'Ordering', accepts: ['ordering'], kind: 'style' },
  { id: 'event', label: 'Event', accepts: ['event'], kind: 'data' },
  { id: 'timer', label: 'Timer', accepts: ['timer'], kind: 'data' },
  // Marks the scene as continuously data-driven (see isAudioTrigger in
  // overlays/custom.html) rather than one-shot event-triggered — wiring
  // this in arms {title}/{artist}/{albumArt} placeholders on any
  // Text/Image reachable from Scene, live off the now-playing feed, with
  // no durationMs/auto-hide (visible for as long as isPlaying is true).
  { id: 'audioPlayer', label: 'Audio Player', accepts: ['audioPlayer'], kind: 'data' }
]

const BACKGROUND_FX_SOCKETS: InputSocket[] = [{ id: 'caption', label: 'Caption', accepts: ['text'], kind: 'content' }]

const START_SOCKETS: InputSocket[] = [
  { id: 'event', label: 'Event', accepts: ['event'], kind: 'data' },
  { id: 'sound', label: 'Sound', accepts: ['sound'], kind: 'data' },
  { id: 'backgroundFx', label: 'Background FX', accepts: ['backgroundAnimation'], kind: 'data' }
]

const TASK_SOCKETS: InputSocket[] = [
  { id: 'target', label: 'Target', accepts: ['text', 'image', 'box', 'video'], kind: 'content' },
  { id: 'animation', label: 'Animation', accepts: ['animation'], kind: 'style' },
  { id: 'position', label: 'Position', accepts: ['position'], kind: 'style' },
  { id: 'size', label: 'Size', accepts: ['size'], kind: 'style' },
  { id: 'transform', label: 'Transform', accepts: ['transform'], kind: 'style' },
  { id: 'opacity', label: 'Opacity', accepts: ['opacity'], kind: 'style' },
  { id: 'shadow', label: 'Shadow', accepts: ['shadow'], kind: 'style' },
  // A Task's own one-shot cue — plays once when THIS step fires (e.g. a
  // cash-register sound only when the donation amount appears), distinct
  // from Start's Sound (fires once at the process's very beginning). See
  // buildProcessSchedule/showProcessContent's own doc comments for how a
  // step's sound gets collected and played.
  { id: 'sound', label: 'Sound', accepts: ['sound'], kind: 'data' }
]

/** Every node type's input sockets, keyed by node `type` — the single source of truth shared between BaseNode's rendering and isValidConnection in SceneBuilderPage.tsx. Node types absent here have no sockets of their own (pure sources — Position/Animation/Event/... — or Wait/End, which only take the process `sequenceIn` row). */
export const NODE_SOCKETS: Record<string, InputSocket[]> = {
  text: TEXT_SOCKETS,
  image: IMAGE_SOCKETS,
  video: VIDEO_SOCKETS,
  box: BOX_SOCKETS,
  scene: SCENE_SOCKETS,
  backgroundAnimation: BACKGROUND_FX_SOCKETS,
  start: START_SOCKETS,
  task: TASK_SOCKETS
}

/**
 * One labeled OUTPUT socket — the output-side mirror of InputSocket, for the
 * few node types whose single output otherwise fans out to genuinely
 * different roles (a Box feeding both Scene's `content`, structurally, and
 * a Task's `target`, as what that step controls — previously both wires
 * left the same unlabeled dot). Most node types have exactly one role for
 * their output (a Position modifier is always "a position", regardless of
 * which target it lands on) and keep the plain single "output" handle —
 * see BaseNode's `outputSockets` prop, only set for the types below.
 * `feeds`: which target INPUT socket ids this output is meant to connect
 * to, enforced by isValidConnection in SceneBuilderPage.tsx exactly like
 * InputSocket.accepts is on the input side.
 */
export type OutputSocket = {
  id: string
  label: string
  kind: 'content' | 'style' | 'data'
  feeds: string[]
}

const STRUCTURAL_OUTPUT: OutputSocket = { id: 'structural', label: 'Structural', kind: 'content', feeds: ['children', 'content'] }
const TARGET_OUTPUT: OutputSocket = { id: 'target', label: 'As Target', kind: 'content', feeds: ['target'] }
const CAPTION_OUTPUT: OutputSocket = { id: 'caption', label: 'As Caption', kind: 'content', feeds: ['caption'] }

const TEXT_OUTPUTS: OutputSocket[] = [STRUCTURAL_OUTPUT, TARGET_OUTPUT, CAPTION_OUTPUT]
const IMAGE_OUTPUTS: OutputSocket[] = [STRUCTURAL_OUTPUT, TARGET_OUTPUT]
const VIDEO_OUTPUTS: OutputSocket[] = [STRUCTURAL_OUTPUT, TARGET_OUTPUT]
const BOX_OUTPUTS: OutputSocket[] = [STRUCTURAL_OUTPUT, TARGET_OUTPUT]

/** Every node type's OUTPUT sockets, keyed by node `type` — analogous to NODE_SOCKETS. Node types absent here (the large majority) render the single generic "output" handle unchanged. */
export const NODE_OUTPUTS: Record<string, OutputSocket[]> = {
  text: TEXT_OUTPUTS,
  image: IMAGE_OUTPUTS,
  video: VIDEO_OUTPUTS,
  box: BOX_OUTPUTS
}

/**
 * What kind of thing a node is, purely for visual grouping (header tint +
 * left accent stripe — see CATEGORY_STYLES/BaseNode) so the graph reads at
 * a glance instead of every node looking the same:
 *  - process: Start/Task/Wait/End — the sequence-flow chain.
 *  - content: Scene/Text/Image/Box — what exists and how it's nested.
 *  - style: Position/Size/Transform/Animation/Hide/Display/Ordering —
 *    per-component modifiers, wired into a SPECIFIC Text/Image/Box/Task.
 *  - data: Event/Random/Roulette/Audio Player/Sound/Timer/Range/Roulette
 *    Settings/Background FX — scene/process-level accessories (event feeds,
 *    one-shot behavior, ambient config) that activate alongside a trigger
 *    rather than reshaping a piece of content — see BackgroundAnimationNode's
 *    own doc comment for why it lives here despite the "FX" name.
 */
export type NodeCategory = 'process' | 'content' | 'style' | 'data'

/** `dot`: solid bg-*-500, for small indicators (SocketRow's dots, the Add Node palette's group/button accents in SceneBuilderPage.tsx) that need a stronger color than the subtle `header` tint. */
export const CATEGORY_STYLES: Record<NodeCategory, { header: string; border: string; dot: string }> = {
  process: { header: 'bg-indigo-500/15', border: 'border-l-indigo-500', dot: 'bg-indigo-500' },
  content: { header: 'bg-emerald-500/15', border: 'border-l-emerald-500', dot: 'bg-emerald-500' },
  style: { header: 'bg-amber-500/15', border: 'border-l-amber-500', dot: 'bg-amber-500' },
  data: { header: 'bg-violet-500/15', border: 'border-l-violet-500', dot: 'bg-violet-500' }
}

const PROCESS_TYPES = new Set(['start', 'task', 'wait', 'end'])

/**
 * Every node type's category, keyed by node `type` — the same source of
 * truth each node component's own `category` prop uses, exported so the
 * Add Node palette (SceneBuilderPage.tsx) can tint its group headers and
 * buttons to match the exact colors a node gets once it's actually placed
 * on the canvas, instead of the palette looking uniform while the graph
 * itself is color-coded.
 */
export const NODE_CATEGORY: Record<string, NodeCategory> = {
  scene: 'content',
  text: 'content',
  image: 'content',
  video: 'content',
  box: 'content',
  start: 'process',
  task: 'process',
  wait: 'process',
  end: 'process',
  position: 'style',
  size: 'style',
  transform: 'style',
  opacity: 'style',
  shadow: 'style',
  animation: 'style',
  ordering: 'style',
  hide: 'style',
  event: 'data',
  randomSource: 'data',
  rouletteSource: 'data',
  audioPlayer: 'data',
  sound: 'data',
  timer: 'data',
  backgroundAnimation: 'data'
}

/**
 * Every node type's default `data`, keyed by node `type` — applied by addNode
 * (SceneBuilderPage.tsx) the moment a node is placed, so a fresh node's data
 * already holds concrete values instead of an empty object that only *looks*
 * populated because each field below falls back to the same default at
 * render time. That per-field fallback stays in place regardless (it's what
 * keeps a scene saved before some field existed — e.g. Text's `bold` —
 * rendering unchanged), this just makes a brand-new node's data match what
 * it visibly shows from the start rather than lagging until the first edit.
 * Node types absent here have no fields of their own (Scene, Start, End,
 * Size, ...) — Size's width/height default to `null` ("auto") anyway, the
 * same as never having been set.
 */
export const NODE_DEFAULTS: Record<string, Record<string, unknown>> = {
  transform: { scaleX: 1, scaleY: 1, rotation: 0 },
  position: { mode: 'absolute', anchor: 'top-left', x: 0, y: 0 },
  opacity: { value: 100 },
  shadow: { color: '#000000', opacity: 60, blur: 6, offsetX: 0, offsetY: 2 },
  text: { text: '', color: '#ffffff', fontSize: 32, letterSpacing: 0, align: 'left', verticalAlign: 'top', bold: true, italic: false },
  timer: { delay: 1000 },
  animation: { type: 'fade', duration: 500, subType: 'auto' },
  box: { background: '#18181b', paddingX: 16, paddingY: 12, shape: 'rectangle', borderRadius: 10, borderEnabled: false, borderWidth: 2, borderColor: '#ffffff' },
  image: { borderRadius: 8, borderEnabled: false, borderWidth: 2, borderColor: '#ffffff' },
  video: { muted: true, loop: true, borderRadius: 8, borderEnabled: false, borderWidth: 2, borderColor: '#ffffff' },
  backgroundAnimation: { type: 'none', color: '#18181b', speed: 1, repeat: false },
  sound: { soundId: 'none', volume: 1 },
  event: { kind: 'alert', alertType: ALERT_TYPES[0] },
  ordering: { layout: 'vertical', direction: 'direct', gap: 8 },
  hide: { hidden: true },
  task: { action: 'show' },
  wait: { delay: 1000 }
}

/**
 * Returns the 1-based priority position of `nodeId` among all nodes whose
 * output connects to the same target, plus the total count of siblings.
 * Only meaningful when outputs === true (the node can connect somewhere).
 * Returns `null` when the node has no outgoing edge or is the only child.
 */
function usePriorityInfo(nodeId: string) {
  const result = useStore(
    (s) => {
      const selfNode = s.nodes.find((n) => n.id === nodeId)
      if (!selfNode || !RENDERABLE_TYPES.includes(selfNode.type!)) {
        return { position: null, total: null }
      }

      const outEdge = s.edges.find((e) => e.source === nodeId)
      if (!outEdge) return { position: null, total: null }

      const siblingEdges = s.edges.filter((e) => e.target === outEdge.target)

      const siblingNodes = siblingEdges
        .map((e) => s.nodes.find((n) => n.id === e.source))
        .filter((n): n is (typeof s.nodes)[number] => n != null && RENDERABLE_TYPES.includes(n.type!))
        .sort((a, b) => ((a.data.priority as number) ?? 0) - ((b.data.priority as number) ?? 0))

      if (siblingNodes.length < 2) return { position: null, total: null }

      const index = siblingNodes.findIndex((n) => n.id === nodeId)
      return { position: index + 1, total: siblingNodes.length }
    },
    (a, b) => a.position === b.position && a.total === b.total
  )

  if (result.position === null) return null
  return result as { position: number; total: number }
}

/**
 * Returns this node's 1-based step number when walking the sequence-flow
 * chain forward from Start (Start itself is step 1) — answers "what order
 * do these Tasks run in" at a glance, the process equivalent of
 * usePriorityInfo above. `null` for a non-process node, or a process node
 * not reachable from Start (an orphaned Task, say — walking a linear chain
 * can't reach it). Mirrors nextProcessNode in SceneBuilderPage.tsx, just
 * walking for display here instead of resolving timing.
 */
function useSequenceInfo(nodeId: string): number | null {
  return useStore((s) => {
    const selfNode = s.nodes.find((n) => n.id === nodeId)
    if (!selfNode || !PROCESS_TYPES.has(selfNode.type!)) return null
    const start = s.nodes.find((n) => n.type === 'start')
    if (!start) return null
    let index = 0
    let current: (typeof s.nodes)[number] | undefined = start
    while (current) {
      index += 1
      if (current.id === nodeId) return index
      const nextEdge = s.edges.find(
        (e) => e.source === current!.id && s.nodes.some((n) => n.id === e.target && PROCESS_TYPES.has(n.type!))
      )
      current = nextEdge ? s.nodes.find((n) => n.id === nextEdge.target) : undefined
    }
    return null
  })
}

const SOCKET_DOT: Record<InputSocket['kind'], string> = {
  content: '!bg-emerald-500',
  style: '!bg-amber-500',
  data: '!bg-violet-500'
}

/**
 * Generic single-output Handle color, keyed by NodeCategory — same palette
 * as SOCKET_DOT/CATEGORY_STYLES.dot, just including 'process' (never an
 * InputSocket.kind, since nothing ever accepts a process node as a
 * parameter — only as the next sequence-flow step). Used by BaseNode's plain
 * "output" handle (every node type without its own NODE_OUTPUTS entry) so an
 * Event/Sound/Timer/Position/Animation/... node's output dot matches the
 * wire color it produces (see displayEdges in SceneBuilderPage.tsx) instead
 * of a flat primary color that told you nothing about what kind of thing it
 * outputs.
 */
const CATEGORY_DOT: Record<NodeCategory, string> = {
  process: '!bg-indigo-500',
  content: '!bg-emerald-500',
  style: '!bg-amber-500',
  data: '!bg-violet-500'
}

/** One labeled input-socket row — the dot is nested inside this (relatively positioned) row rather than placed by percentage on the whole node, so any number of sockets stacks cleanly regardless of node height. */
function SocketRow({ id, label, dotClass, title }: { id: string; label: string; dotClass: string; title: string }) {
  return (
    <div className="relative flex items-center gap-1.5 pl-3 pr-2 h-5 text-[10px] text-muted-foreground">
      <Handle
        type="target"
        position={Position.Left}
        id={id}
        style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)' }}
        className={cn('w-2.5 h-2.5', dotClass)}
        title={title}
      />
      <span className="truncate">{label}</span>
    </div>
  )
}

/** One labeled output-socket row — the source-side mirror of SocketRow, dot on the right edge. Only rendered for node types with an `outputSockets` list (see OutputSocket/NODE_OUTPUTS above); every other node keeps the single generic "output" handle. */
function OutputRow({ id, label, dotClass, title }: { id: string; label: string; dotClass: string; title: string }) {
  return (
    <div className="relative flex items-center justify-end gap-1.5 pl-2 pr-3 h-5 text-[10px] text-muted-foreground">
      <span className="truncate">{label}</span>
      <Handle
        type="source"
        position={Position.Right}
        id={id}
        style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)' }}
        className={cn('w-2.5 h-2.5', dotClass)}
        title={title}
      />
    </div>
  )
}

function BaseNode({
  id,
  data,
  title,
  children,
  outputs = true,
  deletable = true,
  labelable = false,
  category = 'style',
  sockets = [],
  sequenceIn = false,
  outputSockets,
  soon = false,
  help
}: {
  id: string
  data: Record<string, unknown>
  title: string
  /** Optional now that longer notes moved behind `help` — a node whose sockets/fields say everything (Scene, Start, End, ...) can have no body at all. */
  children?: React.ReactNode
  outputs?: boolean
  deletable?: boolean
  labelable?: boolean
  /** Visual grouping only — see the NodeCategory doc comment above. Defaults to 'style' (the largest, catch-all group of modifier nodes). */
  category?: NodeCategory
  /** This node's labeled input sockets, one per parameter — see InputSocket/NODE_SOCKETS above. Empty for pure-source nodes (Position, Animation, Event, ...) which have no inputs of their own. */
  sockets?: InputSocket[]
  /** True for a node that's placeable and connectable but has no effect on rendering yet (see each such node's own doc comment for what's missing) — shows a "Soon" badge so a scene built around it doesn't silently do nothing with no visible cue why. */
  soon?: boolean
  /** Longer usage note, tucked behind a "?" next to the title instead of sitting in the node body as always-visible text — keeps the body to just its actual controls. Omit for a node whose fields are self-explanatory. */
  help?: string
  /**
   * Start/Task/Wait/End only: the process sequence-flow input ("previous
   * step", id "event-in") — separate from `sockets` above because it isn't
   * a parameter, it's what precedes this step. Start has none (entry
   * point, nothing precedes it). See isValidConnection in
   * SceneBuilderPage.tsx for how it's kept strictly for process-to-process
   * connections despite every node's output sharing the same generic
   * "output" id.
   */
  sequenceIn?: boolean
  /** This node's labeled OUTPUT sockets — see OutputSocket/NODE_OUTPUTS above. Only Text/Image/Box set this today; every other node ignores it and keeps the single generic "output" handle (gated by `outputs` above). */
  outputSockets?: OutputSocket[]
}) {
  const { deleteElements, updateNodeData, getEdges, getNodes, getNode, addNodes } = useReactFlow()
  const collapsed = Boolean(data.collapsed)
  const priority = usePriorityInfo(id)
  const sequence = useSequenceInfo(id)
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [labelText, setLabelText] = useState((data.label as string) || '')
  const categoryStyle = CATEGORY_STYLES[category]
  const hasSocketSection = sockets.length > 0 || sequenceIn
  const hasBody = Boolean(children) && !collapsed
  const showTrailingBorder = hasSocketSection || hasBody

  /** Cycle through priority values: clicking rotates all siblings (1->2, 2->3, ..., N->1) */
  const cyclePriority = () => {
    if (!priority) return
    const edges = getEdges()
    const nodes = getNodes()
    const outEdge = edges.find((e) => e.source === id)
    if (!outEdge) return
    const siblings = edges
      .filter((e) => e.target === outEdge.target)
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter((n): n is (typeof nodes)[number] => n != null && RENDERABLE_TYPES.includes(n.type!))
      .sort((a, b) => ((a.data.priority as number) ?? 0) - ((b.data.priority as number) ?? 0))

    // Shift all priorities by 1, wrapping around
    siblings.forEach((n, idx) => {
      const newPos = (idx + 1) % siblings.length + 1
      updateNodeData(n.id, { priority: newPos })
    })
  }

  /** A fresh, unconnected copy right next to the original — same id scheme as the Add Node palette (see addNode in SceneBuilderPage.tsx), deep-cloned data so editing the copy never mutates the original. */
  const duplicateNode = () => {
    const current = getNode(id)
    if (!current) return
    addNodes({
      ...current,
      id: `${current.type}-${Date.now()}`,
      position: { x: current.position.x + 32, y: current.position.y + 32 },
      data: structuredClone(current.data),
      selected: false
    })
  }

  return (
    <div
      className={cn(
        'min-w-[150px] rounded-md border border-l-4 bg-card text-card-foreground shadow-sm bg-background group relative',
        categoryStyle.border
      )}
    >
      <ContextMenu>
      <ContextMenuTrigger asChild>
      <div
        className={cn(
          'px-3 py-2 rounded-tr-md font-semibold text-sm flex justify-between items-center gap-2',
          categoryStyle.header,
          showTrailingBorder ? 'border-b' : 'rounded-br-md'
        )}
      >
        <div
          onClick={() => updateNodeData(id, { collapsed: !collapsed })}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
          <div className="flex items-center min-w-0 flex-1 gap-1.5">
            <span className="truncate shrink-0">{title}</span>
            {help && (
              <NodePopover
                side="right"
                className="w-56 text-xs leading-snug p-2.5"
                trigger={
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    title="Help"
                    className="nodrag shrink-0 flex items-center justify-center size-3.5 rounded-full border border-muted-foreground/50 text-muted-foreground text-[9px] font-bold leading-none hover:bg-accent hover:text-accent-foreground hover:border-foreground/50 transition-colors cursor-pointer"
                  >
                    ?
                  </button>
                }
              >
                {help}
              </NodePopover>
            )}
            {isEditingLabel ? (
              <input
                autoFocus
                type="text"
                className="nodrag bg-transparent outline-none border-b border-primary text-muted-foreground font-normal min-w-0 flex-1"
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                onBlur={() => {
                  setIsEditingLabel(false)
                  updateNodeData(id, { label: labelText })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingLabel(false)
                    updateNodeData(id, { label: labelText })
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                {data.label && <span className="font-normal text-muted-foreground truncate">{data.label as string}</span>}
                {labelable && (
                  <Pencil
                    className="size-3 text-muted-foreground/50 hover:text-foreground transition-colors shrink-0 nodrag cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLabelText((data.label as string) || '')
                      setIsEditingLabel(true)
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
        {soon && (
          <span
            className="nodrag shrink-0 inline-flex items-center justify-center h-4 px-1.5 rounded-full bg-amber-500 text-white text-[9px] font-bold leading-none"
            title="Not wired into rendering yet — this node can be placed and connected, but currently has no effect on the overlay."
          >
            SOON
          </span>
        )}
        {sequence !== null && (
          <span
            className="nodrag shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold leading-none"
            title={`Step ${sequence} in the process sequence (Start → ... → End)`}
          >
            {sequence}
          </span>
        )}
        {priority && (
          <button
            type="button"
            onClick={cyclePriority}
            className="nodrag shrink-0 inline-flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none cursor-pointer hover:opacity-80 transition-opacity"
            title={`Render priority ${priority.position} of ${priority.total} — click to move to end`}
          >
            {priority.position}
          </button>
        )}
        {deletable && (
          <button
            type="button"
            onClick={() => deleteElements({ nodes: [{ id }] })}
            className="nodrag shrink-0 text-muted-foreground hover:text-destructive transition-colors outline-none cursor-pointer"
            title="Delete node"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => updateNodeData(id, { collapsed: !collapsed })}>
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          {collapsed ? 'Expand' : 'Collapse'}
        </ContextMenuItem>
        {deletable && (
          <ContextMenuItem onSelect={duplicateNode}>
            <Copy className="size-4" />
            Duplicate
          </ContextMenuItem>
        )}
        {deletable && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => deleteElements({ nodes: [{ id }] })}>
              <Trash2 className="size-4" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
      </ContextMenu>
      {hasSocketSection && (
        <div className="flex flex-col border-b py-0.5">
          {sockets.map((socket) => (
            <SocketRow
              key={socket.id}
              id={socket.id}
              label={socket.label}
              dotClass={SOCKET_DOT[socket.kind]}
              title={`${socket.label} in${socket.multi ? ' (multiple)' : ''}`}
            />
          ))}
          {sequenceIn && <SocketRow id="event-in" label="Sequence" dotClass="!bg-indigo-500" title="Event in — previous step" />}
        </div>
      )}
      {hasBody && <div className="p-3 flex flex-col gap-2">{children}</div>}
      {outputs &&
        (outputSockets && outputSockets.length > 0 ? (
          <div className="flex flex-col border-t py-0.5">
            {outputSockets.map((socket) => (
              <OutputRow key={socket.id} id={socket.id} label={socket.label} dotClass={SOCKET_DOT[socket.kind]} title={`${socket.label} out`} />
            ))}
          </div>
        ) : (
          <Handle
            type="source"
            position={Position.Right}
            id="output"
            className={cn('w-3 h-3', CATEGORY_DOT[category])}
            title="Output"
          />
        ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-xs gap-2">
      <label className="shrink-0">{label}</label>
      {children}
    </div>
  )
}

/**
 * A minimal popover for a trigger button inside a node — used instead of
 * Radix's Popover for the same reason NodeSelect above rolls its own
 * dropdown: Radix's dismiss-on-outside-click depends on a bubble-phase
 * 'mousedown' listener on document reaching all the way back up, but React
 * Flow's canvas pan gesture (d3-zoom, attached directly to the pane
 * element) calls event.stopImmediatePropagation() on every 'mousedown' that
 * starts on the pane — so that listener never fires, and a Radix Popover
 * opened from inside a node never closes when you click empty canvas.
 * Portaled + capture-phase, same fix as NodeSelect's own outside-click effect.
 */
function NodePopover({
  trigger,
  children,
  className,
  side = 'bottom',
  sideOffset = 8
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
  children: React.ReactNode
  className?: string
  side?: 'bottom' | 'right'
  sideOffset?: number
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [open])

  useEffect(() => {
    if (!open) return
    let rafId: number
    const track = () => {
      const t = triggerRef.current
      const m = menuRef.current
      if (t && m) {
        const rect = t.getBoundingClientRect()
        if (side === 'right') {
          m.style.left = `${rect.right + sideOffset}px`
          m.style.top = `${rect.top}px`
        } else {
          m.style.left = `${rect.left}px`
          m.style.top = `${rect.bottom + sideOffset}px`
        }
      }
      rafId = requestAnimationFrame(track)
    }
    rafId = requestAnimationFrame(track)
    return () => cancelAnimationFrame(rafId)
  }, [open, side, sideOffset])

  const clonedTrigger = React.cloneElement(trigger, {
    ref: triggerRef,
    onClick: (e: React.MouseEvent) => {
      trigger.props.onClick?.(e)
      setOpen((prev) => !prev)
    }
  } as never)

  return (
    <>
      {clonedTrigger}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed' }}
            className={cn('z-[9999] rounded-md border bg-popover text-popover-foreground shadow-md', className)}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 nodrag">
      <HexColorInput
        color={value}
        onChange={onChange}
        prefixed
        className="font-mono text-[10px] text-muted-foreground uppercase bg-transparent w-[4.5rem] outline-none focus:text-foreground text-right border-b border-transparent focus:border-border transition-colors"
      />
      <NodePopover
        className="w-auto p-3 flex flex-col gap-3"
        trigger={
          <button
            type="button"
            className="size-5 rounded border shadow-sm ring-1 ring-border/50 cursor-pointer p-0 shrink-0"
            style={{ backgroundColor: value }}
          />
        }
      >
        <HexColorPicker color={value} onChange={onChange} />
        <HexColorInput
          color={value}
          onChange={onChange}
          prefixed
          className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono uppercase"
        />
      </NodePopover>
    </div>
  )
}

/**
 * `nodrag` is an @xyflow/react convention: without it, a click-drag inside
 * this element is captured as a node-move gesture instead of the browser's
 * normal text selection/interaction. `select-text` overrides the
 * `user-select: none` xyflow puts on .react-flow__node itself, which
 * otherwise blocks drag-selecting text even inside a nodrag input. Both are
 * on every interactive control in every node below.
 */
const numberInputClass = 'nodrag select-text w-16 bg-muted px-1 py-0.5 rounded outline-none'
const selectClass = 'nodrag select-text flex-1 min-w-0 bg-muted px-1 py-0.5 rounded outline-none'

const textInputClass = 'nodrag select-text w-full h-6 bg-muted px-1 rounded outline-none'

/** Multi-line sibling of textInputClass, for Text's own Content field — resize-y lets a longer caption grow past its 3-row default instead of scrolling inside a fixed box. */
const textAreaClass = 'nodrag select-text w-full min-h-[4.5rem] bg-muted px-1 py-1 rounded outline-none resize-y'

const TEXT_PLACEHOLDERS = ['user', 'amount', 'message', 'source', 'title', 'artist'] as const

type SavedNodeMap = Record<string, Record<string, unknown>>

const SavedNodeDataContext = createContext<SavedNodeMap>({})

/**
 * Wraps the `<ReactFlow>` tree in SceneBuilderPage with each node's data AS
 * OF THE LAST SAVE — a separate snapshot from the `nodes` state ReactFlow
 * actually renders (which holds live, possibly-unsaved edits). Exists so
 * NumberInput can fall back to what's genuinely persisted when a field is
 * cleared (see useSavedNodeData/NumberInput's `savedValue`) instead of
 * either the type's generic default or an edit that was never Saved.
 * `savedNodes` is `overlay?.nodes` — undefined before the scene has ever
 * been loaded/saved, same as no saved value existing yet for any field.
 */
export function SavedNodeDataProvider({
  savedNodes,
  children
}: {
  savedNodes: { id: string; data?: Record<string, unknown> }[] | undefined
  children: React.ReactNode
}) {
  const map = useMemo(() => {
    const result: SavedNodeMap = {}
    for (const node of savedNodes ?? []) result[node.id] = node.data ?? {}
    return result
  }, [savedNodes])
  return <SavedNodeDataContext.Provider value={map}>{children}</SavedNodeDataContext.Provider>
}

/** This node's data as of the last Save, or `{}` before anything's been saved — see SavedNodeDataProvider above. */
function useSavedNodeData(id: string): Record<string, unknown> {
  return useContext(SavedNodeDataContext)[id] ?? {}
}

/**
 * Text-backed replacement for `<input type="number">`. A controlled native
 * number input snaps its DOM value back to `Number(x) || fallback` on every
 * keystroke, so intermediate states while typing — "-" before a negative
 * number, "" while clearing the field, "1." before a decimal — get erased
 * mid-type instead of staying editable (the "can't erase/type a negative
 * value" bugs). Keeping a local text buffer while focused lets those
 * intermediate states survive; a syntactically valid number commits (clamped
 * to min/max) live so the canvas preview stays in sync while typing, and
 * blur/Enter always resolves the field to a concrete number (or `null` when
 * `allowEmpty`, e.g. Size's "auto") — never leaves it stuck on garbage.
 * Clearing the field and blurring restores `savedValue` — this field's value
 * as of the last Save (see useSavedNodeData below), not merely the live
 * in-editor `value`, so undoing an in-progress edit by clearing it doesn't
 * quietly keep an unsaved number around either. `fallback` only kicks in
 * when nothing's ever been saved for this field.
 */
// A node's `data` should already hold this field's default the moment it's
// placed (see NODE_DEFAULTS in addNode, SceneBuilderPage.tsx), but this
// still falls back to `fallback` for a nullish `value` regardless (a node
// type not yet covered there, a hand-edited/older saved scene) so the field
// never displays blank when it isn't meant to. Module-level, not a closure
// inside NumberInput, so its own effect can list it without an
// exhaustive-deps warning over a function that's recreated every render.
function displayValue(value: number | null | undefined, allowEmpty: boolean, fallback: number): string {
  if (value !== null && value !== undefined) return String(value)
  return allowEmpty ? '' : String(fallback)
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  className,
  allowEmpty = false,
  fallback = 0,
  savedValue
}: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  min?: number
  max?: number
  placeholder?: string
  className?: string
  /** Empty commits `null` instead of snapping back to `fallback` — for optional fields like Size's width/height ("auto"). */
  allowEmpty?: boolean
  /** What an empty/unparsable field resolves to on blur when `allowEmpty` is false AND there's no saved value to restore instead (see NumberInput's doc comment). */
  fallback?: number
  /** This field's value as of the last Save (from useSavedNodeData) — what clearing the field restores, since `value` alone is just the live, possibly-never-saved edit. `undefined` before anything's ever been saved. */
  savedValue?: number | null
}) {
  const [text, setText] = useState(displayValue(value, allowEmpty, fallback))
  const isFocused = useRef(false)

  useEffect(() => {
    if (isFocused.current) return
    setText(displayValue(value, allowEmpty, fallback))
  }, [value, allowEmpty, fallback])

  const clamp = (n: number): number => {
    let out = n
    if (min !== undefined) out = Math.max(min, out)
    if (max !== undefined) out = Math.min(max, out)
    return out
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      className={className}
      value={text}
      onFocus={() => {
        isFocused.current = true
      }}
      onChange={(e) => {
        const raw = e.target.value
        // Reject anything that isn't a (possibly partial) signed decimal —
        // keeps stray letters out while still allowing "-", ".", "-." mid-type.
        if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return
        setText(raw)
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return
        const parsed = Number(raw)
        if (!Number.isNaN(parsed)) onChange(clamp(parsed))
      }}
      onBlur={() => {
        isFocused.current = false
        // Restore to what was actually Saved for this field, not the
        // generic per-field `fallback` — so clearing a field you'd already
        // saved puts back what you had, not the type's blank-slate default.
        // Only when nothing's ever been saved (a brand-new node/field) does
        // this fall through to `fallback`.
        const restoreTo = savedValue !== null && savedValue !== undefined ? savedValue : fallback
        if (text.trim() === '') {
          if (allowEmpty) {
            onChange(null)
          } else {
            onChange(restoreTo)
            setText(String(restoreTo))
          }
          return
        }
        const parsed = Number(text)
        const resolved = Number.isNaN(parsed) ? restoreTo : clamp(parsed)
        onChange(resolved)
        setText(String(resolved))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
      }}
    />
  )
}

/**
 * A custom dropdown that looks like the native `<select>` used elsewhere in
 * nodes but supports arbitrary React content per option (e.g. badges). The
 * menu is portaled to `document.body` (same trick as PlaceholderPicker) so
 * it stacks above React Flow panels. Position is tracked via RAF so the
 * menu follows the trigger when the canvas is panned or zoomed.
 */
function NodeSelect<T extends string>({
  value,
  options,
  onChange,
  renderOption
}: {
  value: T
  options: readonly T[]
  onChange: (next: T) => void
  /** Custom renderer for each option. Receives the option value and whether it's the currently selected one. Falls back to plain text. */
  renderOption?: (option: T, selected: boolean) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click. Capture phase matters here: React Flow's canvas
  // pan gesture (d3-zoom, attached directly to the pane element) calls
  // event.stopImmediatePropagation() on every 'mousedown' that starts on the
  // pane, so a bubble-phase document listener never sees a click on empty
  // canvas — the classic symptom being "the dropdown won't close when I
  // click the canvas." A capture-phase listener runs on the way DOWN to the
  // target, before that stopImmediatePropagation() call ever happens.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [open])

  // Track trigger position via RAF so the menu follows the node during canvas pan/zoom
  useEffect(() => {
    if (!open) return
    let rafId: number
    const track = () => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (trigger && menu) {
        const rect = trigger.getBoundingClientRect()
        menu.style.left = `${rect.left}px`
        menu.style.top = `${rect.bottom + 2}px`
        menu.style.minWidth = `${rect.width}px`
      }
      rafId = requestAnimationFrame(track)
    }
    rafId = requestAnimationFrame(track)
    return () => cancelAnimationFrame(rafId)
  }, [open])

  const triggerContent = renderOption ? renderOption(value, true) : value

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(selectClass, 'flex items-center gap-1 text-left cursor-pointer text-xs')}
      >
        {triggerContent}
        <ChevronDown className="size-3 shrink-0 opacity-50 ml-auto" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed' }}
            className="z-[9999] rounded-md border bg-popover text-popover-foreground shadow-lg overflow-hidden"
          >
            {/* max-h caps the menu instead of letting it grow unbounded — a
                long options list (e.g. TextNode's Font field, one entry per
                installed system font) could otherwise stretch off-screen.
                ScrollArea takes over past that height, same scrollable
                pattern as the Add Node panel in SceneBuilderPage.tsx. */}
            <ScrollArea className="max-h-72">
              <div className="py-1">
                {options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(opt)
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full text-left px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-1.5',
                      opt === value && 'bg-accent/50'
                    )}
                  >
                    {renderOption ? renderOption(opt, opt === value) : opt}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>,
          document.body
        )}
    </>
  )
}

/**
 * The {} button next to a text field — opens a list of available placeholders
 * and inserts the chosen one at the cursor. Rendered via a portal to
 * document.body: React Flow's own Panels (Add Node, Save Changes, Preview)
 * live outside the pannable node layer with their own z-index, so a menu
 * nested inside a node can never stack above them — it'd render fully
 * visible but silently un-clickable wherever a Panel happens to overlap it.
 */
function PlaceholderPicker({ onInsert }: { onInsert: (token: string) => void }) {
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Capture phase — see NodeSelect's outside-click effect above for why.
  useEffect(() => {
    if (!anchor) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setAnchor(null)
    }
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [anchor])

  const toggle = () => {
    if (anchor) {
      setAnchor(null)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setAnchor({ right: window.innerWidth - rect.right, top: rect.bottom + 4 })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        title="Insert placeholder"
        className="nodrag h-6 px-1.5 rounded bg-muted hover:bg-accent border border-transparent hover:border-border text-[10px] font-mono text-muted-foreground hover:text-accent-foreground shrink-0"
      >
        {'{}'}
      </button>
      {anchor &&
        createPortal(
          <div
            ref={menuRef}
            style={{ right: anchor.right, top: anchor.top }}
            className="nodrag fixed z-[9999] min-w-[110px] rounded-md border bg-popover text-popover-foreground shadow-lg py-1"
          >
            {TEXT_PLACEHOLDERS.map((token) => (
              <button
                key={token}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onInsert(token)
                  setAnchor(null)
                }}
                className="w-full text-left px-2 py-1 text-xs font-mono hover:bg-accent hover:text-accent-foreground"
              >
                {`{${token}}`}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}

/** The output — the single sink every scene needs. Only what's connected here (directly or via a Box) ends up on the OBS overlay page. One per scene, can't be deleted. */
export function SceneNode({ id, data }: NodeProps) {
  return (
    <BaseNode
      id={id}
      data={data}
      title="Scene"
      outputs={false}
      deletable={false}
      category="content"
      sockets={SCENE_SOCKETS}
      help="The output — only what reaches Scene is rendered."
    />
  )
}

export function TransformNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  return (
    <BaseNode id={id} data={data} title="Transform" category="style">
      <Field label="Scale X">
        <NumberInput value={data.scaleX as number} onChange={(v) => updateNodeData(id, { scaleX: v })} fallback={1} savedValue={saved.scaleX as number} className={numberInputClass} />
      </Field>
      <Field label="Scale Y">
        <NumberInput value={data.scaleY as number} onChange={(v) => updateNodeData(id, { scaleY: v })} fallback={1} savedValue={saved.scaleY as number} className={numberInputClass} />
      </Field>
      <Field label="Rotation">
        <NumberInput value={data.rotation as number} onChange={(v) => updateNodeData(id, { rotation: v })} fallback={0} savedValue={saved.rotation as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}

export function PositionNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const mode = (data.mode as string) || 'absolute'
  const anchor = (data.anchor as string) || 'top-left'

  return (
    <BaseNode id={id} data={data} title="Position" category="style">
      <Field label="Mode">
        <NodeSelect
          value={mode}
          options={['absolute', 'relative'] as const}
          onChange={(next) => updateNodeData(id, { mode: next })}
        />
      </Field>
      {mode === 'absolute' && (
        <Field label="Anchor">
          <NodeSelect
            value={anchor}
            options={[
              'top-left', 'top-center', 'top-right',
              'center-left', 'center', 'center-right',
              'bottom-left', 'bottom-center', 'bottom-right'
            ] as const}
            onChange={(next) => updateNodeData(id, { anchor: next })}
          />
        </Field>
      )}
      <Field label={mode === 'absolute' ? 'Offset X' : 'Shift X'}>
        <NumberInput value={data.x as number} onChange={(v) => updateNodeData(id, { x: v })} fallback={0} savedValue={saved.x as number} className={numberInputClass} />
      </Field>
      <Field label={mode === 'absolute' ? 'Offset Y' : 'Shift Y'}>
        <NumberInput value={data.y as number} onChange={(v) => updateNodeData(id, { y: v })} fallback={0} savedValue={saved.y as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}

export function SizeNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  return (
    <BaseNode id={id} data={data} title="Size" category="style">
      <Field label="Width">
        <NumberInput value={data.width as number} onChange={(v) => updateNodeData(id, { width: v })} min={0} allowEmpty placeholder="auto" className={numberInputClass} />
      </Field>
      <Field label="Height">
        <NumberInput value={data.height as number} onChange={(v) => updateNodeData(id, { height: v })} min={0} allowEmpty placeholder="auto" className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}

/** Constant transparency (0–100%) on whatever it's wired into — separate from Animation's fade, which only plays a transition, not a resting state. Wire into a Task's own Opacity socket too, to fade something in/out as a process step instead of (or alongside) Animation's fade type. */
export function OpacityNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const value = (data.value as number) ?? 100
  return (
    <BaseNode id={id} data={data} title="Opacity" category="style">
      <Field label="Opacity">
        <input type="range" min="0" max="100" step="1" value={value} onChange={(e) => updateNodeData(id, { value: Number(e.target.value) })} className="nodrag w-24" />
        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{value}%</span>
      </Field>
    </BaseNode>
  )
}

/**
 * A drop shadow — separate from Text's own old built-in always-on shadow
 * (that field is gone; nothing wired in now means no shadow at all, same
 * "absence = no effect" convention as every other modifier here). Applied
 * as `filter: drop-shadow(...)` rather than text-shadow/box-shadow so ONE
 * implementation works correctly on Text (per-glyph, like text-shadow would)
 * AND on a shaped Box (follows the shape's own clip-path outline, which
 * box-shadow — a plain rectangle unless you hand-sync its radius — would
 * get wrong on a circle/hexagon/diamond Box). See BoxNode's own doc comment
 * for the shape field.
 */
export function ShadowNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  return (
    <BaseNode id={id} data={data} title="Shadow" category="style">
      <Field label="Color">
        <ColorPicker value={(data.color as string) || '#000000'} onChange={(val) => updateNodeData(id, { color: val })} />
      </Field>
      <Field label="Opacity">
        <input type="range" min="0" max="100" step="1" value={(data.opacity as number) ?? 60} onChange={(e) => updateNodeData(id, { opacity: Number(e.target.value) })} className="nodrag w-24" />
        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{(data.opacity as number) ?? 60}%</span>
      </Field>
      <Field label="Blur">
        <NumberInput value={data.blur as number} onChange={(v) => updateNodeData(id, { blur: v })} min={0} fallback={6} savedValue={saved.blur as number} className={numberInputClass} />
      </Field>
      <Field label="Offset X">
        <NumberInput value={data.offsetX as number} onChange={(v) => updateNodeData(id, { offsetX: v })} fallback={0} savedValue={saved.offsetX as number} className={numberInputClass} />
      </Field>
      <Field label="Offset Y">
        <NumberInput value={data.offsetY as number} onChange={(v) => updateNodeData(id, { offsetY: v })} fallback={2} savedValue={saved.offsetY as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}

/** Sentinel for the "use the overlay page's own default font stack" option — NodeSelect can't take an empty/null value. */
const SYSTEM_DEFAULT_FONT = '__default__'

const TEXT_ALIGN_BUTTONS = [
  { id: 'left', Icon: AlignLeft, title: 'Left' },
  { id: 'center', Icon: AlignCenter, title: 'Center' },
  { id: 'right', Icon: AlignRight, title: 'Right' },
  { id: 'justify', Icon: AlignJustify, title: 'Justify' }
] as const

const TEXT_VERTICAL_BUTTONS = [
  { id: 'top', Icon: AlignVerticalJustifyStart, title: 'Top' },
  { id: 'middle', Icon: AlignVerticalJustifyCenter, title: 'Middle' },
  { id: 'bottom', Icon: AlignVerticalJustifyEnd, title: 'Bottom' }
] as const

/** A row of mutually-exclusive icon buttons (Align, Vertical) — the compact node-UI equivalent of TextSettings.tsx's alignment button group elsewhere in the app, since that component's shadcn Button/CollapsibleSection styling doesn't fit inside a node's tight layout. */
function IconToggleGroup<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: readonly { id: T; Icon: LucideIcon; title: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div className="nodrag flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5 w-fit">
      {options.map(({ id, Icon, title }) => (
        <button
          key={id}
          type="button"
          title={title}
          onClick={() => onChange(id)}
          className={cn(
            'flex items-center justify-center size-6 rounded transition-colors',
            id === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}

/**
 * Upload/Remove row for a node-level file upload (ImageNode, SoundNode) —
 * mirrors AlertSoundPicker's upload/remove buttons (components/
 * AlertSoundPicker.tsx) in miniature, for the compact node-UI context.
 * Files themselves persist in the app's own writable directory
 * (userData/custom-images or custom-sounds — see main/index.ts) until
 * explicitly removed here, independent of any particular scene/node using
 * them — same lifetime as a bundled preset asset.
 */
function UploadRow({
  uploading,
  hasCustom,
  onUpload,
  onRemove,
  label
}: {
  uploading: boolean
  hasCustom: boolean
  onUpload: () => void
  onRemove: () => void
  label: string
}) {
  return (
    <div className="nodrag flex items-center gap-1.5">
      <button
        type="button"
        onClick={onUpload}
        disabled={uploading}
        className="flex items-center gap-1 text-[11px] py-1 px-2 rounded bg-muted hover:bg-accent border border-transparent hover:border-border transition-colors disabled:opacity-50"
      >
        <Upload className="size-3" />
        {uploading ? 'Uploading…' : label}
      </button>
      {hasCustom && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove uploaded file"
          className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function TextNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const text = (data.text as string) ?? ''
  const fonts = useSystemFonts()
  // Bold defaults true (data.bold !== false, not Boolean(data.bold)) so
  // every Text node saved before this field existed keeps rendering exactly
  // as it always has — TextView/buildText previously hardcoded font-weight:
  // 700 unconditionally, this field just makes that overridable now.
  // Italic has no such history — false is both the default and what "never
  // set" already meant.
  const bold = data.bold !== false
  const italic = Boolean(data.italic)

  const insertPlaceholder = (token: string) => {
    const el = inputRef.current
    const wrapped = `{${token}}`
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const next = text.slice(0, start) + wrapped + text.slice(end)
    updateNodeData(id, { text: next })
    requestAnimationFrame(() => {
      const caret = start + wrapped.length
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  return (
    <BaseNode id={id} data={data} title="Text" labelable category="content" sockets={TEXT_SOCKETS} outputSockets={TEXT_OUTPUTS}>
      <div className="flex flex-col gap-1 text-xs">
        <label>Content</label>
        <div className="flex items-start gap-1">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => updateNodeData(id, { text: e.target.value })}
            className={textAreaClass}
          />
          <PlaceholderPicker onInsert={insertPlaceholder} />
        </div>
      </div>
      <Field label="Color">
        <ColorPicker value={data.color as string || '#ffffff'} onChange={(val) => updateNodeData(id, { color: val })} />
      </Field>
      <Field label="Font">
        <NodeSelect
          value={(data.fontFamily as string) || SYSTEM_DEFAULT_FONT}
          options={[SYSTEM_DEFAULT_FONT, ...fonts]}
          onChange={(next) => updateNodeData(id, { fontFamily: next === SYSTEM_DEFAULT_FONT ? null : next })}
          renderOption={(opt) =>
            opt === SYSTEM_DEFAULT_FONT ? (
              <span className="truncate">Default</span>
            ) : (
              <span className="truncate" style={{ fontFamily: `"${opt}"` }}>
                {opt}
              </span>
            )
          }
        />
      </Field>
      <Field label="Size">
        <NumberInput
          value={data.fontSize as number}
          onChange={(v) => updateNodeData(id, { fontSize: v })}
          min={1}
          fallback={32}
          savedValue={saved.fontSize as number}
          className={numberInputClass}
        />
      </Field>
      <Field label="Letter spacing">
        <NumberInput
          value={data.letterSpacing as number}
          onChange={(v) => updateNodeData(id, { letterSpacing: v })}
          fallback={0}
          savedValue={saved.letterSpacing as number}
          className={numberInputClass}
        />
      </Field>
      <Field label="Line height">
        <NumberInput
          value={data.lineHeight as number}
          onChange={(v) => updateNodeData(id, { lineHeight: v })}
          min={0}
          allowEmpty
          placeholder="auto"
          className={numberInputClass}
        />
      </Field>
      <Field label="Align">
        <IconToggleGroup value={(data.align as string) || 'left'} options={TEXT_ALIGN_BUTTONS} onChange={(next) => updateNodeData(id, { align: next })} />
      </Field>
      <Field label="Vertical">
        <IconToggleGroup
          value={(data.verticalAlign as string) || 'top'}
          options={TEXT_VERTICAL_BUTTONS}
          onChange={(next) => updateNodeData(id, { verticalAlign: next })}
        />
      </Field>
      <Field label="Style">
        <div className="nodrag flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5 w-fit">
          <button
            type="button"
            title="Bold"
            onClick={() => updateNodeData(id, { bold: !bold })}
            className={cn(
              'flex items-center justify-center size-6 rounded transition-colors',
              bold ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Bold className="size-3.5" />
          </button>
          <button
            type="button"
            title="Italic"
            onClick={() => updateNodeData(id, { italic: !italic })}
            className={cn(
              'flex items-center justify-center size-6 rounded transition-colors',
              italic ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Italic className="size-3.5" />
          </button>
        </div>
      </Field>
    </BaseNode>
  )
}

/**
 * Wired into Scene alongside an Event node, its Delay becomes how long (ms)
 * the event-triggered scene stays visible before auto-hiding — see the doc
 * comment on EventNode. Not wired into Scene at all: no effect yet (an
 * event-triggered scene without a Timer falls back to a fixed 6000ms — see
 * sceneTrigger in SceneBuilderPage.tsx / isEventTrigger in
 * overlays/custom.html).
 */
export function TimerNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  return (
    <BaseNode id={id} data={data} title="Timer" category="data">
      <Field label="Delay (ms)">
        <NumberInput value={data.delay as number} onChange={(v) => updateNodeData(id, { delay: v })} min={0} fallback={1000} savedValue={saved.delay as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}

/** 'auto' (default) plays entrance on a Task's 'show' action and exit on 'hide', same as before this field existed. 'in'/'out' pin the direction explicitly, overriding the Task's own action — see computeTaskState in SceneBuilderPage.tsx / overlays/custom.html. */
const ANIMATION_SUB_TYPES = ['auto', 'in', 'out'] as const

export function AnimationNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const type = (data.type as string) || 'fade'
  return (
    <BaseNode id={id} data={data} title="Animation" category="style">
      <Field label="Type">
        <NodeSelect
          value={type}
          options={ANIMATION_IDS}
          onChange={(next) => updateNodeData(id, { type: next })}
        />
      </Field>
      <Field label="Duration">
        <NumberInput value={data.duration as number} onChange={(v) => updateNodeData(id, { duration: v })} min={0} fallback={500} savedValue={saved.duration as number} className={numberInputClass} />
      </Field>
      {type !== 'none' && (
        <Field label="Sub-type">
          <NodeSelect
            value={(data.subType as string) || 'auto'}
            options={ANIMATION_SUB_TYPES}
            onChange={(next) => updateNodeData(id, { subType: next })}
          />
        </Field>
      )}
    </BaseNode>
  )
}

/** A container: background, padding, corner radius, optional border — mirrors BoxAppearanceConfig/accentColor shared by every real overlay. Connect Text/Image into it, then it into Scene (or straight into Scene itself if you don't need a card behind them). */
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
const BOX_SHAPE_IDS = ['rectangle', 'pill', 'circle', 'hexagon', 'diamond'] as const

export function BoxNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const borderEnabled = Boolean(data.borderEnabled)
  const shape = (data.shape as string) || 'rectangle'
  return (
    <BaseNode id={id} data={data} title="Shape" labelable category="content" sockets={BOX_SOCKETS} outputSockets={BOX_OUTPUTS}>
      <Field label="Background">
        <ColorPicker value={(data.background as string) || '#18181b'} onChange={(val) => updateNodeData(id, { background: val })} />
      </Field>
      <Field label="Padding X">
        <NumberInput value={data.paddingX as number} onChange={(v) => updateNodeData(id, { paddingX: v })} min={0} fallback={16} savedValue={saved.paddingX as number} className={numberInputClass} />
      </Field>
      <Field label="Padding Y">
        <NumberInput value={data.paddingY as number} onChange={(v) => updateNodeData(id, { paddingY: v })} min={0} fallback={12} savedValue={saved.paddingY as number} className={numberInputClass} />
      </Field>
      <Field label="Shape">
        <NodeSelect value={shape} options={BOX_SHAPE_IDS} onChange={(next) => updateNodeData(id, { shape: next })} />
      </Field>
      {shape === 'rectangle' && (
        <Field label="Radius">
          <NumberInput value={data.borderRadius as number} onChange={(v) => updateNodeData(id, { borderRadius: v })} min={0} fallback={10} savedValue={saved.borderRadius as number} className={numberInputClass} />
        </Field>
      )}
      {(shape === 'hexagon' || shape === 'diamond') && (
        <p className="text-[11px] text-muted-foreground leading-snug w-40">Border follows the original rectangle, not the clipped outline.</p>
      )}
      <Field label="Border">
        <Checkbox
          checked={borderEnabled}
          onCheckedChange={(checked) => updateNodeData(id, { borderEnabled: !!checked })}
          className="nodrag"
        />
      </Field>
      {borderEnabled && (
        <>
          <Field label="Border width">
            <NumberInput value={data.borderWidth as number} onChange={(v) => updateNodeData(id, { borderWidth: v })} min={0} fallback={2} savedValue={saved.borderWidth as number} className={numberInputClass} />
          </Field>
          <Field label="Border color">
            <ColorPicker value={(data.borderColor as string) || '#ffffff'} onChange={(val) => updateNodeData(id, { borderColor: val })} />
          </Field>
        </>
      )}
    </BaseNode>
  )
}

/** A static image or (left blank) the live now-playing album art — see showAlbumArt. Connect into a Box or straight into Scene. */
export function ImageNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const [uploading, setUploading] = useState(false)
  const customImageName = (data.customImageName as string) || null
  const borderEnabled = Boolean(data.borderEnabled)

  const upload = async (): Promise<void> => {
    setUploading(true)
    try {
      const result = await window.maddoner.uploadCustomImage(customImageName)
      if (result) updateNodeData(id, { customImageName: result.fileName })
    } finally {
      setUploading(false)
    }
  }

  const removeCustom = async (): Promise<void> => {
    if (!customImageName) return
    await window.maddoner.removeCustomImage(customImageName)
    updateNodeData(id, { customImageName: null })
  }

  return (
    <BaseNode
      id={id}
      data={data}
      title="Image"
      labelable
      category="content"
      sockets={IMAGE_SOCKETS}
      outputSockets={IMAGE_OUTPUTS}
      help="Leave URL empty for the live now-playing album art. Defaults to 96×96 — wire a Size node to override."
    >
      <div className="flex flex-col gap-1 text-xs">
        <label>Image URL</label>
        <input
          type="text"
          placeholder={customImageName ? 'Uploaded file in use' : 'Leave empty for album art'}
          disabled={Boolean(customImageName)}
          value={(data.src as string) || ''}
          onChange={(e) => updateNodeData(id, { src: e.target.value })}
          className={cn(textInputClass, customImageName && 'opacity-50')}
        />
      </div>
      {/* Uploaded file takes priority over the URL above (see ImageView in
          SceneBuilderPage.tsx / buildImage in overlays/custom.html) —
          copied into the app's own writable custom-images directory, so it
          keeps working from any machine without depending on an external
          URL staying online. Persists there until Remove, independent of
          this node/scene. */}
      <UploadRow uploading={uploading} hasCustom={Boolean(customImageName)} onUpload={() => void upload()} onRemove={() => void removeCustom()} label={customImageName ? 'Replace' : 'Upload'} />
      <Field label="Radius">
        <NumberInput value={data.borderRadius as number} onChange={(v) => updateNodeData(id, { borderRadius: v })} min={0} fallback={8} savedValue={saved.borderRadius as number} className={numberInputClass} />
      </Field>
      <Field label="Border">
        <Checkbox checked={borderEnabled} onCheckedChange={(checked) => updateNodeData(id, { borderEnabled: !!checked })} className="nodrag" />
      </Field>
      {borderEnabled && (
        <>
          <Field label="Border width">
            <NumberInput value={data.borderWidth as number} onChange={(v) => updateNodeData(id, { borderWidth: v })} min={0} fallback={2} savedValue={saved.borderWidth as number} className={numberInputClass} />
          </Field>
          <Field label="Border color">
            <ColorPicker value={(data.borderColor as string) || '#ffffff'} onChange={(val) => updateNodeData(id, { borderColor: val })} />
          </Field>
        </>
      )}
    </BaseNode>
  )
}

/**
 * A short video clip (URL only — no upload, unlike Image/Sound; point it at
 * a file already reachable over HTTP) — for reaction gifs-as-video/animated
 * logos/meme clips in an alert, which Image/Lottie-less Animation can't
 * cover. Muted by default: browsers block unmuted autoplay outright, and
 * OBS's embedded Browser Source is no exception — a Sound node wired
 * alongside it is the reliable way to get audio out of an alert anyway (see
 * SoundNode). Connect into a Box or straight into Scene, same as Image.
 */
export function VideoNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const muted = data.muted !== false
  const loop = data.loop !== false
  const borderEnabled = Boolean(data.borderEnabled)
  return (
    <BaseNode
      id={id}
      data={data}
      title="Video"
      labelable
      category="content"
      sockets={VIDEO_SOCKETS}
      outputSockets={VIDEO_OUTPUTS}
      help="Defaults to 320×180 — wire a Size node to override."
    >
      <div className="flex flex-col gap-1 text-xs">
        <label>Video URL</label>
        <input
          type="text"
          placeholder="https://…/clip.mp4"
          value={(data.src as string) || ''}
          onChange={(e) => updateNodeData(id, { src: e.target.value })}
          className={textInputClass}
        />
      </div>
      <Field label="Radius">
        <NumberInput value={data.borderRadius as number} onChange={(v) => updateNodeData(id, { borderRadius: v })} min={0} fallback={8} savedValue={saved.borderRadius as number} className={numberInputClass} />
      </Field>
      <Field label="Loop">
        <Checkbox checked={loop} onCheckedChange={(checked) => updateNodeData(id, { loop: !!checked })} className="nodrag" />
      </Field>
      <Field label="Muted">
        <Checkbox checked={muted} onCheckedChange={(checked) => updateNodeData(id, { muted: !!checked })} className="nodrag" title="Off relies on OBS/the browser allowing autoplaying audio — not guaranteed. Pair with a Sound node for reliable audio instead." />
      </Field>
      <Field label="Border">
        <Checkbox checked={borderEnabled} onCheckedChange={(checked) => updateNodeData(id, { borderEnabled: !!checked })} className="nodrag" />
      </Field>
      {borderEnabled && (
        <>
          <Field label="Border width">
            <NumberInput value={data.borderWidth as number} onChange={(v) => updateNodeData(id, { borderWidth: v })} min={0} fallback={2} savedValue={saved.borderWidth as number} className={numberInputClass} />
          </Field>
          <Field label="Border color">
            <ColorPicker value={(data.borderColor as string) || '#ffffff'} onChange={(val) => updateNodeData(id, { borderColor: val })} />
          </Field>
        </>
      )}
    </BaseNode>
  )
}

/**
 * The full-viewport ambient layer (gradient/pulse/stars/vignette/paratrooper/airdrop)
 * — see BackgroundAnimationId. Category "data" (not "style"): despite the
 * name, this isn't a per-component modifier like Position/Animation/Hide —
 * it doesn't attach to a specific Text/Image/Box the way those do. It's a
 * scene/process-level accessory wired into Start or Scene's own
 * `backgroundFx` socket, the exact same tier as Event/Sound/Timer (all
 * "data" category too) — one config that activates alongside the trigger,
 * not something that reshapes a piece of content. Grouping it with
 * Position/Animation visually implied a relationship it doesn't have.
 *
 * The one thing that DOES make it unusual even among Event/Sound/Timer: it
 * also HAS an input of its own — wire a Text node into it to caption
 * paratrooper's nickname tag / airdrop's crate label with that Text node's
 * content — only its text is used, not its color/alignment, and only for
 * those two Types. See findBackgroundFxLabel in SceneBuilderPage.tsx and
 * the matching lookup in overlays/custom.html's render(), which both walk
 * this same edge.
 */
export function BackgroundAnimationNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const type = (data.type as string) || 'none'
  const isDropEffect = type === 'paratrooper' || type === 'airdrop'

  return (
    <BaseNode id={id} data={data} title="Background FX" category="data" sockets={BACKGROUND_FX_SOCKETS}>
      <Field label="Type">
        <NodeSelect
          value={type}
          options={BACKGROUND_ANIMATION_IDS}
          onChange={(next) => updateNodeData(id, { type: next })}
          renderOption={(opt) => (
            <>
              <span className="truncate">{opt}</span>
              {(opt === 'paratrooper' || opt === 'airdrop') && <MBadge className="size-3.5 text-[8px] shrink-0" />}
            </>
          )}
        />
      </Field>
      <Field label="Color">
        <ColorPicker value={(data.color as string) || '#18181b'} onChange={(val) => updateNodeData(id, { color: val })} />
      </Field>
      <Field label="Speed">
        <NumberInput value={data.speed as number} onChange={(v) => updateNodeData(id, { speed: v })} min={0.5} max={2.5} fallback={1} savedValue={saved.speed as number} className={numberInputClass} />
      </Field>
      {isDropEffect && (
        <>
          <Field label="Repeat">
            <Checkbox
              checked={Boolean(data.repeat)}
              onCheckedChange={(checked) => updateNodeData(id, { repeat: !!checked })}
              className="nodrag"
              title="Off (default): drops exactly one, use Play/Test to replay it. On: keeps dropping one at a time for as long as the scene is showing."
            />
          </Field>
          <p className="text-[11px] text-muted-foreground leading-snug w-40">
            Connect a Text node to caption the {type === 'paratrooper' ? 'nickname tag' : 'crate label'}.
          </p>
        </>
      )}
    </BaseNode>
  )
}

/** Alert sound + volume — see SoundId. Connect into Scene to say this scene plays a sound. Custom uploaded sounds aren't picked from here; choose a bundled preset or none. */
export function SoundNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const [uploading, setUploading] = useState(false)
  const soundId = (data.soundId as string) || 'none'
  const customSoundName = (data.customSoundName as string) || null

  const upload = async (): Promise<void> => {
    setUploading(true)
    try {
      const result = await window.maddoner.uploadCustomSound(customSoundName)
      if (result) updateNodeData(id, { soundId: 'custom', customSoundName: result.fileName })
    } finally {
      setUploading(false)
    }
  }

  const removeCustom = async (): Promise<void> => {
    if (!customSoundName) return
    await window.maddoner.removeCustomSound(customSoundName)
    updateNodeData(id, { soundId: 'none', customSoundName: null })
  }

  return (
    <BaseNode id={id} data={data} title="Sound" category="data">
      <Field label="Sound">
        <NodeSelect
          value={soundId}
          // 'custom' only appears once there's actually an uploaded file to
          // select — same convention as AlertSoundPicker's Select
          // (components/AlertSoundPicker.tsx), so it can't be picked before
          // one exists.
          options={customSoundName ? SOUND_IDS : SOUND_IDS.filter((sid) => sid !== 'custom')}
          onChange={(next) => updateNodeData(id, { soundId: next })}
          renderOption={(opt) => (opt === 'custom' ? 'custom' : opt)}
        />
      </Field>
      {/* Persists in the app's own writable custom-sounds directory (see
          main/index.ts) until Remove, independent of this node/scene — a
          distinct file per upload (this node's own, not shared with
          AlertSoundPicker's custom-sound slot elsewhere in the app, even
          though both write into the same directory). */}
      <UploadRow uploading={uploading} hasCustom={Boolean(customSoundName)} onUpload={() => void upload()} onRemove={() => void removeCustom()} label={customSoundName ? 'Replace' : 'Upload'} />
      <Field label="Volume">
        <input type="range" min="0" max="1" step="0.05" value={data.volume as number ?? 1} onChange={(e) => updateNodeData(id, { volume: Number(e.target.value) })} className="nodrag w-24" />
      </Field>
    </BaseNode>
  )
}

/**
 * Which real subscription/raid/follow/membership/super-chat alert (Kind:
 * Alert) or chat command (Kind: Command, e.g. viewers typing !roulette to
 * join a Roulette) arms this scene — wired into Start (for a Process — see
 * the Start/Task/Wait/End doc comment at the top of this file) or directly
 * into Scene (the older, simpler model): switches it from always-visible to
 * hidden-until-triggered. For Kind Alert, it then waits for a real alert of
 * the picked Type, fills every connected Text node's
 * {user}/{amount}/{message}/{source} placeholders from that event, shows
 * (Animation/Background FX/Sound wired in all fire), holds for however long
 * a Wait/Timer says (default 6s without one), then hides again. See
 * sceneTrigger/processTrigger in SceneBuilderPage.tsx and
 * isEventTrigger/processTrigger in overlays/custom.html — both only ever
 * read alertType, so a Command-kind Event contributes nothing there yet
 * (not wired into a live chat-command trigger, same "reserved" state as
 * RandomSourceNode/RouletteSourceNode/AudioPlayerNode below). Multiple
 * Event nodes on the same Start/Scene, each a different Type, all arm it —
 * whichever fires first triggers the show/hold/hide. Test/Play simulate
 * this with sample data instead of waiting for a real event.
 *
 * Split out from the old single "Data Source" node, which also covered
 * Now Playing/Random/Roulette — those are RandomSourceNode/
 * RouletteSourceNode/AudioPlayerNode below now, kept separate since only
 * Event actually drives anything today.
 */
const EVENT_KINDS = ['alert', 'command'] as const

export function EventNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const kind = (data.kind as string) || 'alert'
  return (
    <BaseNode id={id} data={data} title="Event" category="data">
      <Field label="Kind">
        <NodeSelect
          value={kind}
          options={EVENT_KINDS}
          onChange={(next) => updateNodeData(id, { kind: next })}
        />
      </Field>
      {kind === 'command' ? (
        <div className="flex flex-col gap-1 text-xs">
          <label>Command</label>
          <input
            type="text"
            placeholder="roulette"
            value={(data.command as string) || ''}
            onChange={(e) => updateNodeData(id, { command: e.target.value })}
            className={textInputClass}
          />
          <p className="text-[11px] text-amber-500 leading-snug w-40">SOON — not wired into a live trigger yet.</p>
        </div>
      ) : (
        <Field label="Alert Type">
          <NodeSelect
            value={(data.alertType as string) || ALERT_TYPES[0]}
            options={ALERT_TYPES}
            onChange={(next) => updateNodeData(id, { alertType: next })}
          />
        </Field>
      )}
    </BaseNode>
  )
}

/**
 * Instrumental data sources — ongoing feeds/tools rather than one-shot
 * events, unlike EventNode above. Documents that a scene is meant to react
 * to Random/Roulette/the audio player; not wired into any render logic yet
 * (no effect on rendering — same "reserved" state the old Data Source
 * node's non-alert options were already in).
 */
export function RandomSourceNode({ id, data }: NodeProps) {
  return <BaseNode id={id} data={data} title="Random" category="data" soon help="Reserved for a Random-roll feed." />
}

export function RouletteSourceNode({ id, data }: NodeProps) {
  return <BaseNode id={id} data={data} title="Roulette" category="data" soon help="Reserved for a Roulette feed — entrants would join via a Command-kind Event node." />
}

/**
 * Wired into Scene (see the audioPlayer entry on SCENE_SOCKETS above) marks
 * the scene as continuously data-driven off the Now Playing feed
 * (Spotify/Windows Media — see NowPlayingPayload) instead of one-shot
 * event-triggered: {title}/{artist} placeholders on any Text reachable from
 * Scene fill live (see the {} picker), any such Image left with an empty URL
 * shows the live album art (see ImageNode's own doc comment/showAlbumArt),
 * and the scene shows for as long as isPlaying stays true — no
 * Timer/durationMs, unlike an Event-triggered scene. Mirrors
 * isAudioTrigger/showAudioContent in overlays/custom.html.
 */
export function AudioPlayerNode({ id, data }: NodeProps) {
  return (
    <BaseNode
      id={id}
      data={data}
      title="Audio Player"
      category="data"
      soon
      help="Connect to Scene to show it only while music is playing. Text supports {title}/{artist}; leave an Image's URL empty for live album art."
    />
  )
}


/** Layout modifier: changes flex direction of a Box or Scene. Connect into Box or Scene. */
export function OrderingNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  return (
    <BaseNode id={id} data={data} title="Ordering" category="style">
      <Field label="Layout">
        <NodeSelect
          value={(data.layout as string) || 'vertical'}
          options={['horizontal', 'vertical'] as const}
          onChange={(next) => updateNodeData(id, { layout: next })}
        />
      </Field>
      <Field label="Direction">
        <NodeSelect
          value={(data.direction as string) || 'direct'}
          options={['direct', 'revert'] as const}
          onChange={(next) => updateNodeData(id, { direction: next })}
        />
      </Field>
      <Field label="Gap">
        <NumberInput value={data.gap as number} onChange={(v) => updateNodeData(id, { gap: v })} min={0} fallback={8} savedValue={saved.gap as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}

/**
 * A manual, static visibility toggle — `display: none` in both ScenePreview
 * and overlays/custom.html (see the hide block in modifierStyle/
 * applyModifierStyle) when Hidden is checked (the default: adding this node
 * hides its target). Flipping the checkbox and Saving takes effect live
 * immediately, with no Play/Test/trigger involved (see the doc comment on
 * OverlayServer.setCustomOverlays for why Save intentionally doesn't replay
 * animations but DOES update content/state like this one) — this is for a
 * human flipping a switch during a broadcast (a "BRB" panel, say), NOT for
 * anything timed or event-driven. For that — an element that should
 * show/hide automatically when an alert fires, or as one step among several
 * over time — use a Task's own show/hide action instead (see TaskNode's own
 * doc comment): different job, timing vs. a manual switch, not a
 * duplicate of this.
 */
export function HideNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  return (
    <BaseNode id={id} data={data} title="Hide" category="style">
      <Field label="Hidden">
        <Checkbox
          checked={data.hidden !== false}
          onCheckedChange={(checked) => updateNodeData(id, { hidden: !!checked })}
          className="nodrag"
        />
      </Field>
    </BaseNode>
  )
}

const TASK_ACTIONS = ['show', 'hide', 'update'] as const

/**
 * The entry point of a Process (see the Start/Task/Wait/End doc comment at
 * the top of this file). Connect an Event node into it to pick which alert
 * type arms the whole sequence — the same role Event plays wired into Scene
 * for the older single show/hide model, just wired here instead. A Sound or
 * Background FX node connected here fires once when the process starts,
 * same idea. Its output is the first sequence-flow edge, into a Task or
 * Wait.
 */
export function StartNode({ id, data }: NodeProps) {
  return (
    <BaseNode
      id={id}
      data={data}
      title="Start"
      category="process"
      sockets={START_SOCKETS}
      help="Entry point — connect an Event to say which alert starts this process."
    />
  )
}

/**
 * One step in a Process: shows, hides, or updates ONE component — whichever
 * Text/Image/Box is wired into this Task's own Target socket (see
 * TASK_SOCKETS above). Animation/Position/Size/Transform each get their own
 * dedicated socket too, instead of piling onto Target (an Animation on a
 * Show/Hide plays as the entrance/exit; on Update it's ignored — Update
 * only ever changes Position/Size/Transform without touching visibility).
 * Its output is the next sequence-flow step — another Task, a Wait, or End.
 */
export function TaskNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  return (
    <BaseNode
      id={id}
      data={data}
      title="Task"
      labelable
      category="process"
      sockets={TASK_SOCKETS}
      sequenceIn
      help="Wire the Target this step acts on, plus any modifiers into their own sockets. Sound needs a Target wired too (even an otherwise-inert Update step) — it's what anchors the sound to this moment."
    >
      <Field label="Action">
        <NodeSelect
          value={(data.action as string) || 'show'}
          options={TASK_ACTIONS}
          onChange={(next) => updateNodeData(id, { action: next })}
        />
      </Field>
    </BaseNode>
  )
}

/**
 * A pause in a Process's sequence flow — the time between the previous step
 * and the next one. Same field as the standalone Timer node (wired straight
 * into Scene for the older single-duration model); here it's inline in the
 * chain instead, and a Process can have as many as needed.
 */
export function WaitNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  return (
    <BaseNode id={id} data={data} title="Wait" category="process" sequenceIn>
      <Field label="Delay (ms)">
        <NumberInput value={data.delay as number} onChange={(v) => updateNodeData(id, { delay: v })} min={0} fallback={1000} savedValue={saved.delay as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}

/**
 * The exit point of a Process — reaching it (via sequence flow from the
 * last Task/Wait) tears the whole scene down: Background FX/Sound stop and
 * every Task-controlled component clears, the same final cleanup the older
 * single-duration model did at the end of its Timer. No fields of its own —
 * just a place for the chain to end. Not connecting one at all means the
 * process never explicitly finishes; see buildProcessSchedule for how that
 * degrades (the chain is walked until it runs out of next steps).
 */
export function EndNode({ id, data }: NodeProps) {
  return (
    <BaseNode
      id={id}
      data={data}
      title="End"
      outputs={false}
      category="process"
      sequenceIn
      help="Exit point — the process finishes and the scene clears here."
    />
  )
}
