import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  MarkerType,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  Panel,
  ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './scene-preview-animations.css'
import './scene-builder-canvas.css'
import dagre from 'dagre'
import { nodeTypes, NODE_SOCKETS, NODE_OUTPUTS, CATEGORY_STYLES, NODE_CATEGORY, NODE_DEFAULTS, SavedNodeDataProvider } from '@/components/nodes'
import { useTheme } from '@/providers/ThemeProvider'
import { useCustomOverlays } from '@/providers/CustomOverlaysProvider'
import { CopyableUrl } from '@/components/CopyableUrl'
import { slugify, uniqueUrlKey } from '@/lib/custom-overlays'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Workflow, Trash2, Check, X, Image as ImageIcon, Video as VideoIcon, Music, ChevronRight, Play, FlaskConical, Sparkles, HelpCircle, PanelLeft, PanelRight } from 'lucide-react'
import type { NavKey } from '@/lib/nav'
import type { OverlayUrls } from '@shared/types'
import { CanvasConfig, DEFAULT_CANVAS_CONFIG } from '@shared/canvasConfig'
import { useTour } from '@/providers/TourProvider'

/**
 * A brand-new scene starts with one working example instead of a blank
 * canvas: Text wired straight into Scene. Scene is the single output/sink —
 * see SceneNode's own doc comment in components/nodes — so this both shows
 * newcomers the pattern (connect content → Scene) and means the scene
 * already renders something the moment it's created.
 */
const defaultNodes: Node[] = [
  { id: 'scene', type: 'scene', position: { x: 520, y: 140 }, deletable: false, data: {} },
  { id: '1', type: 'text', position: { x: 200, y: 140 }, data: { text: 'Scene Start' } }
]
const defaultEdges: Edge[] = [{ id: 'e-1-scene', source: '1', target: 'scene' }]

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
const NODE_PALETTE: { type: string; label: string; group: string }[] = [
  { type: 'text', label: 'Text', group: 'Content' },
  { type: 'image', label: 'Image', group: 'Content' },
  { type: 'video', label: 'Video', group: 'Content' },
  { type: 'box', label: 'Shape', group: 'Content' },
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
  { type: 'audioPlayer', label: 'Audio Player', group: 'Data' }
]
const PALETTE_GROUPS = [...new Set(NODE_PALETTE.map((entry) => entry.group))]

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type NodeMap = Record<string, Node>

function buildNodeMap(nodes: Node[]): NodeMap {
  return Object.fromEntries(nodes.map((n) => [n.id, n]))
}

/** Nodes wired directly INTO `nodeId` — see the direction doc comment in components/nodes/index.tsx. Sorted by `data.priority` (lower = rendered first) so the in-editor priority badges control render order. */
function incoming(nodeId: string, edges: Edge[], map: NodeMap): Node[] {
  return edges
    .filter((e) => e.target === nodeId)
    .map((e) => map[e.source])
    .filter((n): n is Node => Boolean(n))
    .sort((a, b) => ((a.data.priority as number) ?? 0) - ((b.data.priority as number) ?? 0))
}

/**
 * The last node of `type` in `mods` — used instead of `.find()` wherever a
 * grouped Transform/Style socket (see MODIFIER_SOCKETS/TASK_SOCKETS in
 * components/nodes/index.tsx) is resolved, since that socket now accepts
 * more than one wire and, occasionally, more than one wire OF THE SAME TYPE
 * (two Position nodes both feeding one Transform group, say). `mods` must
 * already be ordered so the intended winner comes LAST — `incoming()`'s
 * ascending-priority order already does this (ties keep insertion order, so
 * with no explicit priority set the most-recently-connected wire naturally
 * wins), and computeTaskState orders its own accumulated mods the same way
 * for the identical reason.
 */
function lastOfType(mods: Node[], type: string): Node | undefined {
  for (let i = mods.length - 1; i >= 0; i--) {
    if (mods[i].type === type) return mods[i]
  }
  return undefined
}

/**
 * One-time upgrade for edges saved before Position/Size/Transform and
 * Opacity/Shadow/Animation/Hide were consolidated into the single multi-wire
 * `transform`/`style` sockets (see MODIFIER_SOCKETS/TASK_SOCKETS in
 * components/nodes/index.tsx) — remaps each old per-parameter targetHandle
 * to the group socket id that now carries it, purely so the EDITOR can still
 * attach the wire to a socket row that actually exists (isValidConnection/
 * SocketRow both look up sockets by id). The runtime resolvers (modifierStyle
 * below, applyModifierStyle in overlays/custom.html) never read targetHandle
 * at all — they already resolve wiring by the connected node's own `type` —
 * so an un-migrated overlay still renders correctly live; this only matters
 * for editing it further. 'transform' needs no remapping: that id already
 * meant exactly the same thing (only Transform-type nodes) before and after.
 */
const LEGACY_MODIFIER_HANDLE_REMAP: Record<string, string> = {
  position: 'transform',
  size: 'transform',
  opacity: 'style',
  shadow: 'style',
  animation: 'style',
  hide: 'style'
}
function migrateLegacyModifierEdges(edges: Edge[]): Edge[] {
  return edges.map((e) => {
    const remapped = e.targetHandle ? LEGACY_MODIFIER_HANDLE_REMAP[e.targetHandle] : undefined
    return remapped ? { ...e, targetHandle: remapped } : e
  })
}

/**
 * One-time upgrade for edges saved before Audio Player's five outputs
 * (Author/Title/Cover/Event/Now Playing) were consolidated into two —
 * Content (bundles Author+Title+Cover) and Event (bundles the track-change
 * trigger and the Now Playing feed) — see AUDIO_PLAYER_OUTPUTS in
 * components/nodes/index.tsx. Remaps each old sourceHandle to the id that
 * now carries it, purely so the EDITOR can still attach the wire to an
 * output row that actually exists (OutputRow, like SocketRow, looks up
 * sockets by id). Every consumer of these edges (audioContentValues,
 * hasAudioCover, processTrigger's audioArmed, custom.html's isAudioTrigger)
 * already resolves wiring by targetHandle + the source node's own `type`,
 * never by sourceHandle — so an un-migrated overlay still renders correctly
 * live; this only matters for editing it further. These 5 ids are unique to
 * Audio Player's old outputs (no other node type's NODE_OUTPUTS uses them),
 * so remapping by sourceHandle alone, with no source-type check, is safe.
 *
 * A scene that had BOTH Author and Title wired into the same Text's Content
 * socket (the documented way to fill both placeholders at once, back when
 * they were separate outputs) ends up with two edges that are now, post-
 * remap, identical in every field that matters (same source, sourceHandle,
 * target, targetHandle) — genuinely the same connection twice, not two
 * competing producers. Left alone, usePriorityInfo would count that Audio
 * Player as its own "sibling" and show a false "1 of 2" priority badge with
 * no real competitor, so the second copy is dropped here.
 *
 * Also remaps the target side: Scene used to have its OWN dedicated
 * `audioPlayer` input socket (separate from the `event` socket a real Event
 * node uses) for the whole-scene-visibility-by-isPlaying use — that's gone
 * now, folded into Scene's own `event` socket instead (which accepts
 * 'audioPlayer' alongside 'event', same convention Start's `event` socket
 * already used) — see SCENE_SOCKETS/AUDIO_PLAYER_OUTPUTS in components/
 * nodes/index.tsx. `audioPlayer` was never used as a targetHandle anywhere
 * else, so remapping it unconditionally is safe.
 */
const LEGACY_AUDIO_PLAYER_SOURCE_HANDLE_REMAP: Record<string, string> = {
  author: 'content',
  title: 'content',
  cover: 'content',
  trackChanged: 'event',
  feed: 'event'
}
function migrateLegacyAudioPlayerEdges(edges: Edge[]): Edge[] {
  const remapped = edges.map((e) => {
    const newSourceHandle = e.sourceHandle ? LEGACY_AUDIO_PLAYER_SOURCE_HANDLE_REMAP[e.sourceHandle] : undefined
    const newTargetHandle = e.targetHandle === 'audioPlayer' ? 'event' : undefined
    return newSourceHandle || newTargetHandle
      ? { ...e, ...(newSourceHandle ? { sourceHandle: newSourceHandle } : {}), ...(newTargetHandle ? { targetHandle: newTargetHandle } : {}) }
      : e
  })
  const seen = new Set<string>()
  return remapped.filter((e) => {
    const key = `${e.source}|${e.sourceHandle}|${e.target}|${e.targetHandle}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Sample vars used to simulate a real alert from Play/Test — see sceneTrigger and handlePlay. */
const SAMPLE_ALERT_VARS = { user: 'Viewer', amount: 25, message: 'Sample message', source: 'twitch' }

/**
 * Sample now-playing vars for previewing an Audio Player's Content/Event
 * outputs (see AUDIO_PLAYER_OUTPUTS in components/nodes) in the editor —
 * there's no live now-playing feed inside the builder (unlike the real
 * overlay, which gets one over the 'now-playing' broadcast channel — see
 * overlays/custom.html), so a Text/Image wired to Content always previews
 * with this fixed sample instead. Mirrors the sample vars render() in
 * overlays/custom.html uses for its own Test-button simulation.
 */
const SAMPLE_AUDIO_VARS = { artist: 'Sample Artist', title: 'Sample Track', albumArt: '' }

/**
 * { artist, title } from SAMPLE_AUDIO_VARS when Audio Player's Content
 * output (see TEXT_SOCKETS/AUDIO_PLAYER_OUTPUTS in components/nodes/
 * index.tsx) feeds this Text's own Content socket (id `content`), or null
 * when it isn't wired in. Both fields always come together — Content is one
 * bundled wire, not separate Author/Title ones — so a template like
 * "{artist} — {title}" fills in full or not at all. Merged into `vars` by
 * TextView, same as audioContentValues merges the live feed into `vars` in
 * overlays/custom.html — Content's own template still decides what's shown,
 * this only supplies the values its {artist}/{title} placeholders resolve
 * to.
 */
function audioContentValues(nodeId: string, edges: Edge[], map: NodeMap): { artist?: string; title?: string } | null {
  const hasAudioContent = edges.some((e) => e.target === nodeId && e.targetHandle === 'content' && map[e.source]?.type === 'audioPlayer')
  return hasAudioContent ? { artist: SAMPLE_AUDIO_VARS.artist, title: SAMPLE_AUDIO_VARS.title } : null
}

/** Whether this Image's `imageContent` socket is wired to Audio Player's Content output. Mirrors hasAudioCover in overlays/custom.html. */
function hasAudioCover(nodeId: string, edges: Edge[], map: NodeMap): boolean {
  return edges.some((e) => e.target === nodeId && e.targetHandle === 'imageContent' && map[e.source]?.type === 'audioPlayer')
}

/**
 * Whether Scene is wired to an Event node — if so, the scene is hidden
 * until a matching alert fires (for real: a live event; in the editor:
 * Play/Test simulating one), shows for `durationMs`, then hides again. See
 * EventNode/TimerNode's own doc comments in components/nodes/index.tsx,
 * and isEventTrigger — the same logic mirrored in overlays/custom.html.
 */
function sceneTrigger(nodes: Node[], edges: Edge[]): { active: boolean; alertTypes: string[]; durationMs: number } {
  const scene = nodes.find((n) => n.type === 'scene')
  if (!scene) return { active: false, alertTypes: [], durationMs: 6000 }
  const map = buildNodeMap(nodes)
  const members = incoming(scene.id, edges, map)
  const alertTypes = [
    ...new Set(
      members
        .filter((n) => n.type === 'event')
        .map((n) => n.data.alertType as string)
        .filter(Boolean)
    )
  ]
  if (alertTypes.length === 0) return { active: false, alertTypes, durationMs: 6000 }
  const timer = members.find((n) => n.type === 'timer')
  const durationMs = (timer?.data.delay as number) || 6000
  return { active: true, alertTypes, durationMs }
}

/** Duration (ms) for one Animation modifier — mirrors the CSS fallback each [data-animation] rule in animations.css falls back to when the node's own Duration field is unset. */
function animationFallbackMs(type: string): number {
  if (type === 'slide') return 300
  if (type === 'bounce') return 500
  return 250
}

/**
 * Longest configured Animation-node duration among Scene's own rendered
 * content (each Box's own Animation plus its Text/Image children's) — used
 * to know how long an event-triggered scene's exit needs to finish playing
 * (see animations.css's .hiding rules, which reuse the SAME duration/type as
 * the entrance) before it's safe to actually unmount. Mirrors
 * playExitAnimations in overlays/custom.html, just computed from the graph
 * instead of measured off the DOM.
 */
function maxExitDurationMs(nodes: Node[], edges: Edge[]): number {
  const scene = nodes.find((n) => n.type === 'scene')
  if (!scene) return 250
  const map = buildNodeMap(nodes)
  let max = 0
  const consider = (mods: Node[]): void => {
    const anim = lastOfType(mods, 'animation')
    if (!anim) return
    const type = (anim.data.type as string) || 'fade'
    if (type === 'none') return
    const duration = (anim.data.duration as number) || animationFallbackMs(type)
    if (duration > max) max = duration
  }
  // Recurses into nested Boxes (see BOX_SOCKETS' own doc comment in
  // components/nodes/index.tsx) to any depth — a deeply-nested Text/Image/
  // Video's own Animation still needs to count toward the exit buffer, or
  // its exit gets cut off exactly like an un-buffered top-level one would.
  const visit = (n: Node): void => {
    const mods = incoming(n.id, edges, map)
    consider(mods)
    if (n.type === 'box') {
      for (const child of mods.filter((m) => m.type === 'text' || m.type === 'image' || m.type === 'video' || m.type === 'box')) {
        visit(child)
      }
    }
  }
  const renderable = incoming(scene.id, edges, map).filter((n) => n.type === 'box' || n.type === 'text' || n.type === 'image' || n.type === 'video')
  for (const n of renderable) visit(n)
  return max || 250
}

/**
 * Fills {user}/{amount}/{message}/{source}-style placeholders (or
 * {artist}/{title} from audioContentValues — see TextView) from an event's
 * vars — mirrors interpolate() in overlays/custom.html. `vars` is null
 * outside an event-triggered show, in which case every placeholder is left
 * as literal text. A key NOT present in `vars` (as opposed to present but
 * empty) is left literal too, same reasoning — only actually-AVAILABLE
 * placeholders get filled in, so e.g. "{user}: {title}" with Event vars but
 * no {title} source keeps "{title}" literal instead of collapsing to a bare
 * "Viewer: ".
 */
function interpolate(template: string, vars: Record<string, unknown> | null): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!(key in vars)) return match
    const value = vars[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

/**
 * Position/Size/Transform/Opacity/Shadow/Hide modifier nodes wired into a
 * target, expressed as inline CSS — mirrors applyModifierStyle in
 * overlays/custom.html. Hide: a manual on/off switch (display: none unless
 * its own Hidden checkbox is off) — see HideNode's own doc comment in
 * components/nodes/index.tsx for how this differs from a Task's show/hide.
 */
/** `#rrggbb` + an opacity percent -> `rgba(...)` — for the Shadow node's color+opacity fields, which (unlike Text/Box's own plain colors) need an alpha channel a hex string alone can't carry. */
function hexToRgba(hex: string, opacityPercent: number): string {
  const clean = (hex || '#000000').replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) || 0
  const g = parseInt(clean.slice(2, 4), 16) || 0
  const b = parseInt(clean.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`
}

function modifierStyle(mods: Node[], baseMods?: Node[]): React.CSSProperties {
  const style: React.CSSProperties = {}

  const size = lastOfType(mods, 'size')
  const baseSize = baseMods && lastOfType(baseMods, 'size')
  if (size || baseSize) {
    const targetSize = size || baseSize
    if (targetSize?.data.width != null) style.width = targetSize.data.width as number
    if (targetSize?.data.height != null) style.height = targetSize.data.height as number
  }
  
  let transformStr = ''
  
  const transform = lastOfType(mods, 'transform')
  const baseTransform = baseMods && lastOfType(baseMods, 'transform')
  if (transform || baseTransform) {
    const bsx = (baseTransform?.data.scaleX as number) ?? 1
    const bsy = (baseTransform?.data.scaleY as number) ?? 1
    const brot = (baseTransform?.data.rotation as number) ?? 0
    if (transform) {
      const tsx = (transform.data.scaleX as number) ?? 1
      const tsy = (transform.data.scaleY as number) ?? 1
      const trot = (transform.data.rotation as number) ?? 0
      transformStr += `scale(${bsx * tsx}, ${bsy * tsy}) rotate(${brot + trot}deg) `
    } else {
      transformStr += `scale(${bsx}, ${bsy}) rotate(${brot}deg) `
    }
  }
  
  const position = lastOfType(mods, 'position')
  const basePosition = baseMods && lastOfType(baseMods, 'position')
  if (position || basePosition) {
    const bx = (basePosition?.data.x as number) ?? 0
    const by = (basePosition?.data.y as number) ?? 0
    let x = bx
    let y = by
    if (position) {
      if (position.data.x != null || basePosition) x = bx + ((position.data.x as number) ?? 0)
      if (position.data.y != null || basePosition) y = by + ((position.data.y as number) ?? 0)
    }
    
    const targetPos = position || basePosition
    const mode = (targetPos?.data.mode as string) || 'absolute'
    const anchor = (targetPos?.data.anchor as string) || 'top-left'

    if (mode === 'absolute') {
      style.position = 'absolute'
      if (anchor.includes('top')) style.top = y
      if (anchor.includes('bottom')) style.bottom = y
      if (anchor.includes('left')) style.left = x
      if (anchor.includes('right')) style.right = x
      
      if (anchor === 'center' || anchor === 'top-center' || anchor === 'bottom-center') {
        style.left = '50%'
        style.marginLeft = x
        transformStr += 'translateX(-50%) '
      }
      if (anchor === 'center' || anchor === 'center-left' || anchor === 'center-right') {
        style.top = '50%'
        style.marginTop = y
        transformStr += 'translateY(-50%) '
      }
    } else if (mode === 'relative') {
      transformStr += `translate(${x}px, ${y}px) `
    }
  }
  
  if (transformStr) {
    style.transform = transformStr.trim()
  }
  
  const opacity = lastOfType(mods, 'opacity')
  const baseOpacity = baseMods && lastOfType(baseMods, 'opacity')
  if (opacity || baseOpacity) {
    const bOp = (baseOpacity?.data.value as number) ?? 100
    if (opacity) {
      const tOp = (opacity.data.value as number) ?? 100
      style.opacity = (bOp / 100) * (tOp / 100)
    } else {
      style.opacity = bOp / 100
    }
  }

  const shadow = lastOfType(mods, 'shadow')
  if (shadow) {
    const color = hexToRgba((shadow.data.color as string) || '#000000', (shadow.data.opacity as number) ?? 60)
    const offsetX = (shadow.data.offsetX as number) ?? 0
    const offsetY = (shadow.data.offsetY as number) ?? 2
    const blur = (shadow.data.blur as number) ?? 6
    style.filter = `drop-shadow(${offsetX}px ${offsetY}px ${blur}px ${color})`
  } else if (baseMods) {
    const baseShadow = lastOfType(baseMods, 'shadow')
    if (baseShadow) {
      const color = hexToRgba((baseShadow.data.color as string) || '#000000', (baseShadow.data.opacity as number) ?? 60)
      const offsetX = (baseShadow.data.offsetX as number) ?? 0
      const offsetY = (baseShadow.data.offsetY as number) ?? 2
      const blur = (baseShadow.data.blur as number) ?? 6
      style.filter = `drop-shadow(${offsetX}px ${offsetY}px ${blur}px ${color})`
    }
  }

  const hide = lastOfType(mods, 'hide')
  const baseHide = baseMods && lastOfType(baseMods, 'hide')
  if (hide) {
    if (hide.data.hidden !== false) style.display = 'none'
  } else if (baseHide) {
    if (baseHide.data.hidden !== false) style.display = 'none'
  }

  return style
}

/** A node's own border fields (borderEnabled/borderWidth/borderColor — same shape as BoxNode's) as a CSS border value, or undefined when off. Shared by ImageView/VideoView; BoxView computes its own inline since it also needs the fields for other purposes. */
function borderStyle(node: Node): string | undefined {
  if (!node.data.borderEnabled) return undefined
  return `${(node.data.borderWidth as number) ?? 2}px solid ${(node.data.borderColor as string) || '#ffffff'}`
}

/** An Animation modifier wired into a node, or null if there isn't one (or it's set to "none"). */
type Anim = { type: string; duration?: number; subType?: 'in' | 'out' } | null

/**
 * Animation modifier nodes wired into a target — mirrors applyAnimation in
 * overlays/custom.html. Unlike modifierStyle, this isn't itself a style
 * object: the caller applies it as a data-animation attribute + "visible"
 * class (so animations.css's keyframes pick it up) plus an optional
 * --anim-duration var, and remounts the element (see the playToken-keyed
 * lists in ScenePreview/BoxView) to actually trigger it on Play. `subType`
 * ('in'/'out', from the Animation node's Sub-type field) is only meaningful
 * in a Process (see computeTaskState below) — 'auto' or unset there falls
 * back to the Task's own show/hide action, same as before this field
 * existed; the plain single-trigger model ignores it entirely (direction is
 * already unambiguous from lifecycle: entrance on build, exit on hide).
 */
function animationAttrs(mods: Node[]): Anim {
  const anim = lastOfType(mods, 'animation')
  if (!anim) return null
  const type = (anim.data.type as string) || 'fade'
  if (type === 'none') return null
  const subType = anim.data.subType as string | undefined
  return {
    type,
    duration: anim.data.duration as number | undefined,
    ...(subType === 'in' || subType === 'out' ? { subType } : {})
  }
}

/**
 * Start/Task/Wait/End form a SECOND kind of edge in the same graph —
 * sequence flow ("then"), separate from the data/composition edges
 * (Text/Image → Box → Scene, modifier → component) everything else in this
 * file walks via `incoming`. See the doc comment on nodeTypes in
 * components/nodes/index.tsx for the full picture.
 */
const PROCESS_TYPES = new Set(['start', 'task', 'wait', 'end'])

/** The next Start/Task/Wait/End node reached by following `nodeId`'s OWN sequence-flow edge forward (linear chains only — see buildProcessSchedule). */
function nextProcessNode(nodeId: string, edges: Edge[], map: NodeMap): Node | null {
  const edge = edges.find((e) => e.source === nodeId && map[e.target] && PROCESS_TYPES.has(map[e.target].type!))
  return edge ? map[edge.target] : null
}

const CONTENT_TYPES = new Set(['text', 'image', 'video', 'box'])
/** Same as CONTENT_TYPES plus 'scene' — used for the MiniMap's node coloring below, where Scene (never an edge SOURCE, so absent from CONTENT_TYPES) still needs to read as "content" like Text/Image/Box. */
const CONTENT_TYPES_WITH_SCENE = new Set([...CONTENT_TYPES, 'scene'])
/** Position/Size/Transform/Animation/Hide/Display/Ordering — see NodeCategory's 'style' bucket in components/nodes/index.tsx. */
const STYLE_TYPES = new Set(['position', 'size', 'transform', 'opacity', 'shadow', 'animation', 'hide', 'ordering'])
/** Event/Sound/Timer/Background FX/Random/Roulette/Audio Player/Range/Roulette Settings — see NodeCategory's 'data' bucket. */
const DATA_TYPES = new Set(['event', 'sound', 'timer', 'backgroundAnimation', 'randomSource', 'rouletteSource', 'audioPlayer'])

/**
 * Purely cosmetic pass over `edges` for display in the graph — the raw
 * `edges` state (what onEdgesChange/onConnect/handleSave actually use)
 * never carries this, so it can't leak into what gets persisted.
 *
 * Colors reuse the exact same category palette as the node headers
 * themselves (CATEGORY_STYLES in components/nodes/index.tsx: indigo =
 * process, emerald = content, amber = style, sky blue = data) — a wire's
 * color always matches its SOURCE node's own header tint, so there's one
 * mental model to learn, not two. Six looks, from most to least prominent:
 *  - sequence flow (Start/Task/Wait/End → Start/Task/Wait/End): bold,
 *    indigo, animated, arrowhead — the process spine, unmistakable even in
 *    a busy graph.
 *  - a component wired into a Task's Target socket (what that step acts
 *    on): emerald, dashed, arrowhead.
 *  - a component wired structurally (Text/Image → Box, Box → Scene — what
 *    exists and how it's nested): emerald too, but SOLID — same family as
 *    the line above, distinguished by dash vs. no dash rather than a new
 *    color, since both describe "content."
 *  - a Position/Size/Transform/Animation/Hide/Display/Ordering modifier
 *    wired into its target: amber, thin, dashed.
 *  - an Event/Sound/Timer/Background FX/instrumental-data node wired into
 *    Start or Scene: sky blue, thin, dashed.
 *  - anything uncategorized: muted gray fallback — should be rare; every
 *    real node type today falls into one of the buckets above.
 *
 * A node with its own labeled OUTPUT sockets (NODE_OUTPUTS/OutputSocket in
 * components/nodes) can fan out to a DIFFERENT kind per socket than its own
 * overall category — Audio Player (category 'data') is the case that
 * matters here: Content is kind 'content' (it feeds a Content socket, same
 * family as Text/Image's own structural wires), only its Event output is
 * actually 'data' (a trigger/state signal, not a value). `outSocket` below
 * checks the SPECIFIC socket this edge left from for that override; Text/
 * Image/Box's own outputSockets are all kind 'content' anyway (matching
 * their node-level category), so this changes nothing for them.
 */
function displayEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const map = buildNodeMap(nodes)
  return edges.map((e) => {
    const sourceType = map[e.source]?.type
    const targetType = map[e.target]?.type
    const outSocket = sourceType ? NODE_OUTPUTS[sourceType]?.find((o) => o.id === e.sourceHandle) : undefined
    const isContentSource = (sourceType && CONTENT_TYPES.has(sourceType)) || outSocket?.kind === 'content'
    if (sourceType && targetType && PROCESS_TYPES.has(sourceType) && PROCESS_TYPES.has(targetType)) {
      return {
        ...e,
        style: { stroke: '#6366f1', strokeWidth: 3 },
        animated: true,
        zIndex: 10,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1', width: 20, height: 20 }
      }
    }
    if (targetType === 'task' && isContentSource) {
      return {
        ...e,
        style: { stroke: '#10b981', strokeWidth: 2, strokeDasharray: '5 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981', width: 16, height: 16 }
      }
    }
    if (isContentSource) {
      return {
        ...e,
        style: { stroke: '#10b981', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981', width: 12, height: 12 }
      }
    }
    if (sourceType && STYLE_TYPES.has(sourceType)) {
      return {
        ...e,
        style: { stroke: '#f59e0b', strokeWidth: 1.25, strokeDasharray: '2 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 12, height: 12 }
      }
    }
    if (sourceType && DATA_TYPES.has(sourceType)) {
      return {
        ...e,
        style: { stroke: '#0ea5e9', strokeWidth: 1.25, strokeDasharray: '2 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0ea5e9', width: 12, height: 12 }
      }
    }
    return {
      ...e,
      style: { stroke: '#94a3b8', strokeWidth: 1.25, strokeDasharray: '2 3' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 12, height: 12 }
    }
  })
}

/**
 * MiniMap node coloring (see the <MiniMap> in the main render) — reuses the
 * exact same category palette as CATEGORY_STYLES/displayEdges above, so the
 * minimap's tiny dots read as "which kind of node lives where" at a glance,
 * matching the graph's own header tints instead of one more color to learn.
 */
function minimapNodeColor(node: Node): string {
  if (node.type && PROCESS_TYPES.has(node.type)) return '#6366f1'
  if (node.type && CONTENT_TYPES_WITH_SCENE.has(node.type)) return '#10b981'
  if (node.type && STYLE_TYPES.has(node.type)) return '#f59e0b'
  if (node.type && DATA_TYPES.has(node.type)) return '#0ea5e9'
  return '#94a3b8'
}

/** Fallback size (px) for a node dagre hasn't measured yet — see layoutGraph. Close to BaseNode's own real footprint (min-w-[150px] plus a couple of socket rows) so the very first Prettify pass on a freshly-loaded graph is still reasonable before nodes settle to their true rendered size. */
const LAYOUT_DEFAULT_SIZE = { width: 190, height: 110 }

/**
 * Auto-arranges `nodes` left-to-right by dagre's layered/Sugiyama algorithm
 * (the standard companion for React Flow — same approach used throughout
 * the ecosystem, not hand-rolled here) — the "Prettify" button's whole job.
 * Feeds EVERY edge into the same graph (sequence flow, content targets,
 * structural nesting, modifiers, triggers alike) so a node's position
 * accounts for all of its relationships at once, not just the process
 * spine — but sequence-flow edges get a much higher weight so dagre still
 * prioritizes keeping Start → Task → Wait → ... → End straight and compact
 * (the graph's primary narrative), the same convention every hand-built
 * example scene this session already followed by hand.
 *
 * Uses each node's REAL measured size (React Flow populates `node.measured`
 * once it's actually rendered — true by the time a user can click Prettify
 * at all) so differently-sized nodes (a collapsed Wait vs. an expanded Box
 * with several fields) don't overlap; falls back to LAYOUT_DEFAULT_SIZE for
 * the rare unmeasured case. Returns new `Node[]` with only `position`
 * changed — everything else (data, type, selection state) passes through
 * untouched, and this never runs automatically; it's a one-shot action from
 * the Prettify button, so a user's own manual arrangement is never silently
 * overwritten.
 */
function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 140, marginx: 40, marginy: 40 })
  g.setDefaultEdgeLabel(() => ({}))

  const sizeOf = (node: Node): { width: number; height: number } => ({
    width: node.measured?.width ?? LAYOUT_DEFAULT_SIZE.width,
    height: node.measured?.height ?? LAYOUT_DEFAULT_SIZE.height
  })

  for (const node of nodes) {
    g.setNode(node.id, sizeOf(node))
  }
  for (const edge of edges) {
    if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue
    g.setEdge(edge.source, edge.target, { weight: edge.targetHandle === 'event-in' ? 12 : 1 })
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    if (!pos) return node
    const { width, height } = sizeOf(node)
    return { ...node, position: { x: pos.x - width / 2, y: pos.y - height / 2 } }
  })
}

/** One Task, resolved to when it fires and what it affects — see buildProcessSchedule. */
interface ScheduledTask {
  atMs: number
  targetId: string
  action: string
  mods: Node[]
}

/**
 * Walks the linear Start → Task → Wait → ... → End sequence-flow chain into
 * a flat, time-resolved schedule: one entry per Task, `atMs` accumulated
 * from every Wait node's delay passed so far. A Task with no component
 * wired into it (via a plain data edge, same convention Box already uses
 * for its own children) is skipped. Returns null when there's no Start node
 * at all — see processTrigger, the caller that decides whether this applies.
 * Mirrors buildProcessSchedule in overlays/custom.html.
 */
function buildProcessSchedule(nodes: Node[], edges: Edge[]): { schedule: ScheduledTask[]; totalMs: number } | null {
  const map = buildNodeMap(nodes)
  const start = nodes.find((n) => n.type === 'start')
  if (!start) return null
  const schedule: ScheduledTask[] = []
  let atMs = 0
  let current = nextProcessNode(start.id, edges, map)
  while (current) {
    if (current.type === 'wait') {
      atMs += (current.data.delay as number) || 1000
    } else if (current.type === 'task') {
      const incomingNodes = incoming(current.id, edges, map)
      const target = incomingNodes.find((n) => n.type === 'text' || n.type === 'image' || n.type === 'video' || n.type === 'box')
      if (target) {
        schedule.push({
          atMs,
          targetId: target.id,
          action: (current.data.action as string) || 'show',
          // 'sound' rides along same as animation/position/... — ignored by
          // computeTaskState (only .find()s the types it knows), picked
          // back out by atMs in handlePlay to preview a Task's own Sound.
          mods: incomingNodes.filter(
            (n) => n.type === 'animation' || n.type === 'position' || n.type === 'size' || n.type === 'transform' || n.type === 'opacity' || n.type === 'shadow' || n.type === 'sound'
          )
        })
      }
    } else if (current.type === 'end') {
      break
    }
    current = nextProcessNode(current.id, edges, map)
  }
  return { schedule, totalMs: atMs }
}

/**
 * How much EXTRA time (ms) beyond totalMs is needed before it's safe to
 * stop the simulated Play run — mirrors processExitBufferMs in
 * overlays/custom.html. Without this, whichever Task(s) fire at exactly
 * totalMs (the schedule's own last moment) get cut off before their
 * animation plays a single frame: handlePlay used to flip eventPhase to
 * 'idle' — which immediately hides ScenePreview's content — at totalMs
 * itself, the SAME instant those Tasks' animation would just be starting.
 * Only the final wave needs this; anything earlier already has the time
 * until the NEXT scheduled moment to play out naturally.
 */
function processExitBufferMs(schedule: ScheduledTask[], totalMs: number): number {
  let max = 0
  for (const s of schedule) {
    if (s.atMs !== totalMs) continue
    const animAttrs = animationAttrs(s.mods)
    if (!animAttrs) continue
    const duration = animAttrs.duration || animationFallbackMs(animAttrs.type)
    if (duration > max) max = duration
  }
  return max
}

/** Whether Scene's process is armed by an Event node wired into its Start node — the process equivalent of sceneTrigger. Takes priority over sceneTrigger wherever both are checked. */
/**
 * Whether Scene's process is armed — either by a DataSource(alert) wired
 * into its Start node (`alertTypes`, matched against a real alert), or by
 * an Audio Player wired into Start (`audioArmed` — a track-change trigger
 * instead of a type match, only meaningful in the real overlay since the
 * editor has no live now-playing feed to react to — see processTrigger in
 * overlays/custom.html). Either one alone makes `active` true.
 */
function processTrigger(nodes: Node[], edges: Edge[]): { active: boolean; alertTypes: string[]; audioArmed: boolean } {
  const start = nodes.find((n) => n.type === 'start')
  if (!start) return { active: false, alertTypes: [], audioArmed: false }
  const map = buildNodeMap(nodes)
  const members = incoming(start.id, edges, map)
  const alertTypes = [
    ...new Set(
      members
        .filter((n) => n.type === 'event')
        .map((n) => n.data.alertType as string)
        .filter(Boolean)
    )
  ]
  const audioArmed = members.some((n) => n.type === 'audioPlayer')
  return { active: alertTypes.length > 0 || audioArmed, alertTypes, audioArmed }
}

/** One component's resolved state at a point in a running Process — see computeTaskState. */
interface TaskState {
  /** false = not rendered at all. */
  visible: boolean
  style: React.CSSProperties
  anim: Anim
  /** True while a 'hide' Task's own animation window is still playing — adds the .hiding class so animations.css plays the exit instead of the entrance. */
  hiding: boolean
}

/**
 * Resolves ONE component's state at time `atMs` from every Task in
 * `schedule` targeting it — "last Task wins" for visibility; style
 * (position/size/transform) accumulates from every one of its Tasks'
 * modifiers up to `atMs`, most recent field wins (reuses modifierStyle, fed
 * mods ordered OLDEST-first so its own lastOfType() picks the latest —
 * same "last in the array wins" convention every other modifierStyle caller
 * uses, so a Task's own Transform/Style group with 2 wires of the same type
 * resolves the identical way a component's direct one does).
 * `action: 'update'` never affects visibility, only style — see
 * buildProcessSchedule. Mirrors computeTaskState in overlays/custom.html.
 */
function computeTaskState(schedule: ScheduledTask[], targetId: string, atMs: number, baseMods?: Node[]): TaskState {
  const mine = schedule.filter((s) => s.targetId === targetId && s.atMs <= atMs)
  const orderedMods = [...mine].sort((a, b) => a.atMs - b.atMs).flatMap((s) => s.mods)
  const style = modifierStyle(orderedMods, baseMods)

  const showHide = [...mine].filter((s) => s.action === 'show' || s.action === 'hide').sort((a, b) => b.atMs - a.atMs)[0]
  let visible = false
  let anim: Anim = null
  let hiding = false
  if (showHide) {
    const animAttrs = animationAttrs(showHide.mods)
    const duration = animAttrs ? animAttrs.duration || animationFallbackMs(animAttrs.type) : 0
    const withinAnim = animAttrs !== null && atMs - showHide.atMs < duration
    visible = showHide.action === 'show' || withinAnim
    if (withinAnim) {
      anim = { type: animAttrs!.type, duration }
      hiding = animAttrs!.subType ? animAttrs!.subType === 'out' : showHide.action === 'hide'
    }
  }

  return { visible, style, anim, hiding }
}

function TextView({
  node,
  style,
  anim,
  played,
  hiding,
  vars,
  audioValues,
  crossAxis
}: {
  node: Node
  style: React.CSSProperties
  anim: Anim
  played: boolean
  /** Playing its exit (reverse of entrance) — see the doc comment on ScenePreview's eventState handling. */
  hiding: boolean
  /** Current event's placeholder values (see sceneTrigger) — null outside an event-triggered show. */
  vars: Record<string, unknown> | null
  /** { artist, title } from Audio Player's Content wire into this node's own Content socket, or null — see audioContentValues. Merged into `vars` below, same as buildText merges the live feed in overlays/custom.html; Content's own template still decides what's shown. */
  audioValues: { artist?: string; title?: string } | null
  /**
   * The CROSS axis of whichever Box/Scene this Text is a direct child of
   * (crossAxisFor, computed by the caller off THAT parent's own Ordering) —
   * the axis flexbox's `items-center` (Scene/BoxView's own fixed cross-axis
   * rule) actually leaves room along. Align/Vertical below only stretch
   * this element (alignSelf) to fill that room when it's the relevant one
   * AND the field was actually changed from its default, so a Text using
   * default settings renders pixel-identical to before this existed.
   */
  crossAxis: 'horizontal' | 'vertical'
}) {
  // Bold defaults true (data.bold !== false) — see the matching comment on
  // TextNode in components/nodes/index.tsx: font-weight:700 used to be
  // hardcoded here unconditionally, so every pre-existing Text node must
  // keep rendering bold unless explicitly turned off now that it's a field.
  const bold = node.data.bold !== false
  const italic = Boolean(node.data.italic)
  const align = (node.data.align as 'left' | 'center' | 'right' | 'justify') || 'left'
  const verticalAlign = (node.data.verticalAlign as string) || 'top'
  // A Position modifier's own anchor (top-left/top-right/center/...) is
  // meant to place this element's OWN box at that corner — but the
  // unconditional width:100% below (kept for the in-flow/in-box case, so
  // Align has room to matter there) means the box already spans the full
  // parent width regardless of which corner is picked, so every anchor
  // ends up looking the same. Once something has actually anchored it
  // (position:absolute) AND no Size gives it a real width of its own (see
  // modifierStyle), let it shrink back to its own content instead so the
  // anchor actually differs.
  const isAnchored = style.position === 'absolute' && style.width == null
  const needsStretch = crossAxis === 'horizontal' ? align !== 'left' : verticalAlign !== 'top'
  return (
    <div
      className={cn(anim && played && 'visible', anim && hiding && 'hiding')}
      data-animation={anim?.type}
      style={
        {
          width: isAnchored ? 'auto' : '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: verticalAlign === 'bottom' ? 'flex-end' : verticalAlign === 'middle' ? 'center' : 'flex-start',
          alignSelf: needsStretch ? 'stretch' : undefined,
          // Content's own field is a multi-line textarea — preserves both
          // the line breaks the user typed and normal word-wrapping,
          // instead of CSS's default collapsing every "\n" to a space.
          whiteSpace: 'pre-wrap',
          fontSize: (node.data.fontSize as number) || 32,
          fontWeight: bold ? 700 : 400,
          fontStyle: italic ? 'italic' : 'normal',
          letterSpacing: `${(node.data.letterSpacing as number) ?? 0}px`,
          lineHeight: node.data.lineHeight != null ? (node.data.lineHeight as number) : undefined,
          ...style,
          color: (node.data.color as string) || '#ffffff',
          textAlign: align,
          fontFamily: node.data.fontFamily ? `"${node.data.fontFamily as string}"` : undefined,
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {interpolate((node.data.text as string) ?? '', audioValues ? { ...vars, ...audioValues } : vars) || (
        // Editor-only affordance — see the matching one on BoxView's empty
        // state. An empty Text node has zero natural width, so without this
        // it (and any Box wrapping only it) collapses to a near-invisible
        // sliver once scaled down for the preview panel.
        <span className="opacity-40 italic">Empty text</span>
      )}
    </div>
  )
}

function ImageView({
  node,
  style,
  anim,
  played,
  hiding,
  urls,
  audioCover
}: {
  node: Node
  style: React.CSSProperties
  anim: Anim
  played: boolean
  hiding: boolean
  /** Needed to build an absolute URL for an uploaded custom-images file (node.data.customImageName, takes priority over data.src — see ImageNode's own doc comment) — null before getOverlayUrls() resolves, in which case the node just shows its placeholder icon a beat longer. */
  urls: OverlayUrls | null
  /** Whether this node's `imageContent` socket is wired to Audio Player's Content output — see hasAudioCover. Forces the sample album-art placeholder, same priority buildImage in overlays/custom.html gives the live feed over a set URL/uploaded image. */
  audioCover: boolean
}) {
  const customImageName = node.data.customImageName as string | undefined
  const src = audioCover
    ? undefined
    : customImageName && urls
      ? `http://${urls.host}:${urls.port}/overlays/custom-images/${encodeURIComponent(customImageName)}`
      : (node.data.src as string | undefined)
  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden shrink-0',
        anim && played && 'visible',
        anim && hiding && 'hiding'
      )}
      data-animation={anim?.type}
      style={
        {
          background: 'rgba(255, 255, 255, 0.08)',
          // No own Width/Height field (see ImageNode's own doc comment in
          // components/nodes/index.tsx) — 96x96 here is only the fallback;
          // `...style` (a wired Size node's width/height, from
          // modifierStyle) overrides it since it spreads AFTER these.
          width: 96,
          height: 96,
          ...style,
          borderRadius: `${(node.data.borderRadius as number) ?? 8}px`,
          border: borderStyle(node),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {src ? (
        <img src={src} className="w-full h-full object-cover" />
      ) : audioCover ? (
        // Editor-only affordance, same reasoning as TextView's "Empty text"
        // — no live album art to preview in the builder, so a distinct icon
        // (rather than the plain ImageIcon an unwired Image shows) confirms
        // the Content wire is doing something instead of looking identical to
        // an empty node.
        <Music className="text-white/40 size-6" />
      ) : (
        <ImageIcon className="text-white/40 size-6" />
      )}
    </div>
  )
}

/** Mirrors ImageView — see buildVideo in overlays/custom.html. Autoplays muted/looping in the editor preview too, same defaults as the real overlay. */
function VideoView({ node, style, anim, played, hiding }: { node: Node; style: React.CSSProperties; anim: Anim; played: boolean; hiding: boolean }) {
  const src = node.data.src as string | undefined
  const muted = node.data.muted !== false
  const loop = node.data.loop !== false
  return (
    <div
      className={cn('flex items-center justify-center overflow-hidden shrink-0', anim && played && 'visible', anim && hiding && 'hiding')}
      data-animation={anim?.type}
      style={
        {
          background: 'rgba(255, 255, 255, 0.08)',
          // No own Width/Height field, same reasoning as ImageView above.
          width: 320,
          height: 180,
          ...style,
          borderRadius: `${(node.data.borderRadius as number) ?? 8}px`,
          border: borderStyle(node),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {src ? (
        <video src={src} autoPlay muted={muted} loop={loop} playsInline className="w-full h-full object-cover" />
      ) : (
        <VideoIcon className="text-white/40 size-6" />
      )}
    </div>
  )
}

/** A content node (Text/Image/Video), or a nested Box (delegated to BoxView) — plus whatever's wired into ITS input (Position, Transform, Animation, ...). */
function ContentView({
  node,
  edges,
  map,
  playToken,
  played,
  hiding,
  vars,
  schedule,
  clockMs,
  urls,
  depth = 0,
  crossAxis
}: {
  node: Node
  edges: Edge[]
  map: NodeMap
  playToken: number
  played: boolean
  hiding: boolean
  vars: Record<string, unknown> | null
  /** A running Process's resolved Tasks, if any — see computeTaskState. Components with no Task targeting them fall through to the graph's own modifiers/wiring below, unaffected. */
  schedule: ScheduledTask[]
  clockMs: number
  urls: OverlayUrls | null
  /** Nesting depth so far (0 = directly on Scene) — see BoxView's own doc comment for why this is capped. */
  depth?: number
  /** The CROSS axis of whichever Box/Scene `node` is a direct child of — see TextView's own doc comment. Only consumed for a `text` node; a nested Box computes a FRESH one off its own Ordering for ITS OWN children. */
  crossAxis: 'horizontal' | 'vertical'
}) {
  // A nested Box (see BOX_SOCKETS' own doc comment in components/nodes/
  // index.tsx) — BoxView resolves its OWN schedule/style/vars, same as a
  // top-level one; ContentView/BoxView are mutually recursive to whatever
  // depth the graph nests.
  if (node.type === 'box') {
    return (
      <BoxView node={node} edges={edges} map={map} playToken={playToken} played={played} hiding={hiding} vars={vars} schedule={schedule} clockMs={clockMs} urls={urls} depth={depth} />
    )
  }
  const mods = incoming(node.id, edges, map)
  const audioValues = node.type === 'text' ? audioContentValues(node.id, edges, map) : null
  const audioCover = node.type === 'image' && hasAudioCover(node.id, edges, map)
  if (schedule.length > 0 && schedule.some((s) => s.targetId === node.id)) {
    const task = computeTaskState(schedule, node.id, clockMs, mods)
    if (!task.visible) return null
    if (node.type === 'text') return <TextView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} vars={vars} audioValues={audioValues} crossAxis={crossAxis} />
    if (node.type === 'image') return <ImageView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} urls={urls} audioCover={audioCover} />
    if (node.type === 'video') return <VideoView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} />
    return null
  }
  const style = modifierStyle(mods)
  const anim = animationAttrs(mods)
  if (node.type === 'text') return <TextView node={node} style={style} anim={anim} played={played} hiding={hiding} vars={vars} audioValues={audioValues} crossAxis={crossAxis} />
  if (node.type === 'image') return <ImageView node={node} style={style} anim={anim} played={played} hiding={hiding} urls={urls} audioCover={audioCover} />
  if (node.type === 'video') return <VideoView node={node} style={style} anim={anim} played={played} hiding={hiding} />
  return null
}

/** Ordering modifier node wired into a target (Box or Scene), expressed as a tailwind flex-direction class. */
function orderingClass(mods: Node[]): string {
  const ordering = mods.find((m) => m.type === 'ordering')
  if (!ordering) return 'flex-col' // default

  const layout = (ordering.data.layout as string) || 'vertical'
  const direction = (ordering.data.direction as string) || 'direct'

  if (layout === 'horizontal') {
    return direction === 'revert' ? 'flex-row-reverse' : 'flex-row'
  } else {
    return direction === 'revert' ? 'flex-col-reverse' : 'flex-col'
  }
}

/** Spacing (px) between a Box/Scene's children, from the same Ordering modifier orderingClass reads — mirrors orderingGap in overlays/custom.html. 8px (the old hardcoded CSS value) when no Ordering node is wired, so every scene predating this field keeps its exact old spacing. */
function orderingGap(mods: Node[]): number {
  const ordering = mods.find((m) => m.type === 'ordering')
  return (ordering?.data.gap as number) ?? 8
}

/** Which axis is the CROSS axis for a Box/Scene's children, from the same Ordering modifier orderingClass reads — 'vertical' for a horizontal/row layout, 'horizontal' for the default vertical/column one. Mirrors crossAxisFor in overlays/custom.html; see TextView's own doc comment for what this is used for. */
function crossAxisFor(mods: Node[]): 'horizontal' | 'vertical' {
  const ordering = mods.find((m) => m.type === 'ordering')
  const layout = (ordering?.data.layout as string) || 'vertical'
  return layout === 'horizontal' ? 'vertical' : 'horizontal'
}

/** A Box's corner treatment (see BOX_SHAPE_IDS' own doc comment in components/nodes/index.tsx) as borderRadius/clipPath — mirrors boxShapeStyle in overlays/custom.html. */
function boxShapeStyle(node: Node): { borderRadius: string; clipPath?: string } {
  const shape = (node.data.shape as string) || 'rectangle'
  if (shape === 'circle') return { borderRadius: '50%' }
  if (shape === 'pill') return { borderRadius: '9999px' }
  if (shape === 'hexagon') return { borderRadius: '0px', clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }
  if (shape === 'diamond') return { borderRadius: '0px', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }
  return { borderRadius: `${(node.data.borderRadius as number) ?? 10}px` }
}

/** A Box: its own Position/Transform/Animation modifiers, plus the Text/Image nodes wired into it as children. */
/**
 * Nesting can go as deep as the graph wants (see BOX_SOCKETS' own doc
 * comment in components/nodes/index.tsx) — this cap is only a safety net
 * against a cycle slipping past isValidConnection's own guard (imported/
 * hand-edited JSON, say) turning into infinite recursion that crashes this
 * React tree; no legitimate scene should ever come close to it. Mirrors
 * MAX_BOX_DEPTH in overlays/custom.html.
 */
const MAX_BOX_DEPTH = 12

/** Drag-to-resize bounds (px) for the live preview panel — see handlePreviewResizeStart. */
const MIN_PREVIEW_WIDTH = 160
const MAX_PREVIEW_WIDTH = 720
const DEFAULT_PREVIEW_WIDTH = 320
/** localStorage key for the preview's remembered width — same 'maddoner:*' convention as ThemeProvider/I18nProvider's own persisted preferences. */
const PREVIEW_WIDTH_STORAGE_KEY = 'maddoner:sceneBuilderPreviewWidth'

function BoxView({
  node,
  edges,
  map,
  playToken,
  played,
  hiding,
  vars,
  schedule,
  clockMs,
  urls,
  depth = 0
}: {
  node: Node
  edges: Edge[]
  map: NodeMap
  playToken: number
  played: boolean
  hiding: boolean
  vars: Record<string, unknown> | null
  schedule: ScheduledTask[]
  clockMs: number
  urls: OverlayUrls | null
  depth?: number
}) {
  const incomingNodes = incoming(node.id, edges, map)
  const children =
    depth >= MAX_BOX_DEPTH ? [] : incomingNodes.filter((n) => n.type === 'text' || n.type === 'image' || n.type === 'video' || n.type === 'box')
  const orderClass = orderingClass(incomingNodes)
  const childCrossAxis = crossAxisFor(incomingNodes)

  const useProcess = schedule.length > 0 && schedule.some((s) => s.targetId === node.id)
  const task = useProcess ? computeTaskState(schedule, node.id, clockMs, incomingNodes) : null
  if (useProcess && !task!.visible) return null

  const modStyle = useProcess ? task!.style : modifierStyle(incomingNodes)
  const anim = useProcess ? task!.anim : animationAttrs(incomingNodes)
  const effectivePlayed = useProcess ? true : played
  const effectiveHiding = useProcess ? task!.hiding : hiding

  return (
    <div
      className={cn('flex items-center', orderClass, anim && effectivePlayed && 'visible', anim && effectiveHiding && 'hiding')}
      data-animation={anim?.type}
      style={
        {
          ...modStyle,
          position: modStyle.position ?? 'relative',
          gap: `${orderingGap(incomingNodes)}px`,
          background: (node.data.background as string) || '#18181b',
          padding: `${(node.data.paddingY as number) ?? 12}px ${(node.data.paddingX as number) ?? 16}px`,
          border: borderStyle(node),
          ...boxShapeStyle(node),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {children.length === 0 && (
        // Editor-only affordance: without this, an unwired Box collapses to
        // just its own padding (a near-invisible dot once the canvas is
        // scaled down for the preview panel) — see BackgroundFxLayer's own
        // preview-vs-real-overlay distinction for the same pattern. Sized in
        // the same ~canvas-px range as real Text content (see TextView) so
        // it survives the same scale-down instead of vanishing at 10px.
        <span className="text-white/30 italic whitespace-nowrap" style={{ fontSize: 20 }}>
          Empty shape — wire a Text, Image, Video or Shape into it
        </span>
      )}
      {children.map((child) => (
        <ContentView
          key={`${child.id}-${playToken}`}
          node={child}
          edges={edges}
          map={map}
          playToken={playToken}
          played={played}
          hiding={hiding}
          vars={vars}
          schedule={schedule}
          clockMs={clockMs}
          urls={urls}
          depth={depth + 1}
          crossAxis={childCrossAxis}
        />
      ))}
    </div>
  )
}

/**
 * The Background FX node feeding a scene, if any — mirrors
 * showProcessContent/applyBackgroundFx in overlays/custom.html. For a
 * Process (a Start node exists), Background FX is wired into Start (the
 * trigger point) rather than Scene, same convention as Event/Sound;
 * otherwise connected to Scene when one exists, or a flat scan (pre-
 * Scene-node saves) like ScenePreview's own fallback branch.
 */
function findBackgroundFx(nodes: Node[], edges: Edge[]): Node | undefined {
  const map = buildNodeMap(nodes)
  const start = nodes.find((n) => n.type === 'start')
  if (start) return incoming(start.id, edges, map).find((n) => n.type === 'backgroundAnimation')
  const scene = nodes.find((n) => n.type === 'scene')
  if (!scene) return nodes.find((n) => n.type === 'backgroundAnimation')
  return incoming(scene.id, edges, map).find((n) => n.type === 'backgroundAnimation')
}

/**
 * The Text node wired INTO a Background FX node, if any — its content
 * captions paratrooper's nickname tag / airdrop's crate label (see
 * BackgroundAnimationNode's own doc comment). Mirrors the same lookup in
 * overlays/custom.html's render().
 */
function findBackgroundFxLabel(
  bgNode: Node | undefined,
  nodes: Node[],
  edges: Edge[],
  vars: Record<string, unknown> | null
): string {
  if (!bgNode) return ''
  const map = buildNodeMap(nodes)
  const textNode = incoming(bgNode.id, edges, map).find((n) => n.type === 'text')
  return interpolate((textNode?.data.text as string) || '', vars)
}

/** The subset of paratrooper.js's/airdrop.js's returned controller this page drives — see overlays/paratrooper.js's setup() doc comment for what each does. */
interface OverlayEffectController {
  setSpeed: (speed: number) => void
  setRepeat: (repeat: boolean) => void
  setNickname?: (name: string) => void
  setLabel?: (text: string) => void
  trigger: () => void
}

/**
 * paratrooper.js/airdrop.js are the exact scripts overlays/custom.html loads
 * for the real OBS Browser Source — loaded here from that same local overlay
 * server (see OverlayUrls.host/port) so the in-editor preview shows the
 * actual sprite drop instead of a reimplementation. Cached at module scope:
 * every BackgroundFxLayer instance across the app session shares the one
 * fetch/parse and the resulting window.OverlayParatrooperEffect/
 * OverlayAirdropEffect globals.
 */
let overlayEffectScriptsPromise: Promise<void> | null = null
function loadOverlayEffectScripts(host: string, port: number): Promise<void> {
  if (overlayEffectScriptsPromise) return overlayEffectScriptsPromise
  const base = `http://${host}:${port}/overlays`
  for (const href of [`${base}/paratrooper.css`, `${base}/airdrop.css`]) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }
  const loadScript = (src: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.onload = () => resolve()
      script.onerror = () => reject(new Error(`Failed to load ${src}`))
      document.head.appendChild(script)
    })
  overlayEffectScriptsPromise = Promise.all([loadScript(`${base}/paratrooper.js`), loadScript(`${base}/airdrop.js`)]).then(
    () => {}
  )
  return overlayEffectScriptsPromise
}

/**
 * The ambient full-panel layer a Background FX node produces — mirrors
 * #bg/.overlay-bg in overlays/custom.html. Rendered as a sibling of
 * ScenePreview, absolutely positioned within the same preview panel, so it
 * shows even when nothing is otherwise connected to Scene.
 *
 * gradient/pulse/stars/vignette are driven by data-bg + the preview's own
 * copy of background-animations.css (scene-preview-animations.css).
 * paratrooper/airdrop instead load and drive the REAL
 * overlays/paratrooper.js|airdrop.js (loadOverlayEffectScripts above) on
 * this same element — those scripts already auto-play once on becoming
 * active and stop on their own (see setRepeat/trigger on paratrooper.js),
 * so picking the type is enough to see it; `playToken` (bumped by the
 * Preview panel's Play button, see handlePlay) calls .trigger() to replay a
 * non-repeating drop on demand, same as it remounts Text/Image/Box for
 * their own entrance animations. `played` gates activation — for a plain
 * scene that's `playToken > 0` (nothing moves until Play); for an
 * event-triggered scene (see sceneTrigger) it instead follows the
 * simulated/real alert's own show/hide window, same as `vars`/`label`.
 */
function BackgroundFxLayer({
  node,
  label,
  urls,
  playToken,
  played
}: {
  node?: Node
  /** Text content of whatever Text node is wired into the Background FX node's input — see findBackgroundFxLabel. */
  label: string
  urls: OverlayUrls | null
  playToken: number
  played: boolean
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const controllers = useRef<{ paratrooper?: OverlayEffectController; airdrop?: OverlayEffectController }>({})

  const type = (node?.data.type as string) || 'none'
  const color = (node?.data.color as string) || '#18181b'
  const speed = (node?.data.speed as number) ?? 1
  const repeat = Boolean(node?.data.repeat)

  useEffect(() => {
    if (!urls) return
    let cancelled = false
    loadOverlayEffectScripts(urls.host, urls.port).then(() => {
      if (cancelled || !elRef.current) return
      const w = window as unknown as {
        OverlayParatrooperEffect?: { setup: (el: Element) => OverlayEffectController }
        OverlayAirdropEffect?: { setup: (el: Element) => OverlayEffectController }
      }
      controllers.current.paratrooper = w.OverlayParatrooperEffect?.setup(elRef.current)
      controllers.current.airdrop = w.OverlayAirdropEffect?.setup(elRef.current)
    })
    return () => {
      cancelled = true
    }
  }, [urls])

  useEffect(() => {
    controllers.current.paratrooper?.setSpeed(speed)
    controllers.current.paratrooper?.setRepeat(repeat)
    controllers.current.paratrooper?.setNickname?.(label)
    controllers.current.airdrop?.setSpeed(speed)
    controllers.current.airdrop?.setRepeat(repeat)
    controllers.current.airdrop?.setLabel?.(label)
  }, [speed, repeat, label])

  useEffect(() => {
    // trigger() no-ops via its own isActive() check when nothing is active
    // yet (playToken still 0, so data-bg below is 'none') — so this is safe
    // to call unconditionally, including on mount. It's what forces a
    // REPLAY on every Play bump after the first; the first is instead
    // covered by data-bg/'.visible' transitioning from inert to `type`
    // below, which the scripts' own "just became active" handling already
    // auto-plays once on its own.
    controllers.current.paratrooper?.trigger()
    controllers.current.airdrop?.trigger()
  }, [playToken])

  return (
    <div
      ref={elRef}
      // Inert (data-bg="none", no .visible) until Play is pressed at least
      // once — matches the same playToken > 0 gate the entrance animations
      // use (TextView/ImageView/BoxView): the preview shouldn't move on its
      // own just because a Background FX type was picked, only once Play
      // starts it.
      className={cn('scene-preview-bg', played && type !== 'none' && 'visible')}
      data-bg={played ? type : 'none'}
      style={
        {
          '--bg-animation-color': color,
          '--bg-animation-speed': String(speed)
        } as React.CSSProperties
      }
    />
  )
}

/** Live status of an event-triggered Scene (see sceneTrigger) — drives ScenePreview/BackgroundFxLayer's played/hiding/vars gating. */
interface PreviewEventState {
  active: boolean
  /** Ignored when !active (a plain scene is always "visible"). True through BOTH the 'showing' and 'hiding' phases — content stays mounted while its exit animation plays. */
  visible: boolean
  /** True only during the 'hiding' phase — adds the .hiding class so animations.css plays each Animation node's exit instead of its entrance. Ignored when !active. */
  hiding: boolean
  vars: Record<string, unknown> | null
  alertTypes: string[]
}

/**
 * Renders exactly what overlays/custom.html renders for this node graph —
 * kept in step with it so both the in-editor preview and the real OBS
 * Browser Source agree on what a graph produces.
 *
 * Walks from the Scene node: whatever's wired into it (directly, or nested
 * inside a Box) is what's rendered — see the direction doc comment on
 * BaseNode in components/nodes/index.tsx. A scene saved before Scene existed
 * has no such node; for those, fall back to the old flat scan (first Box,
 * every Image, every Text) so it keeps rendering as it always did.
 *
 * When Scene is event-triggered (eventState.active), nothing renders at all
 * until eventState.visible — matches overlays/custom.html staying hidden
 * for a real Browser Source until a matching alert arrives; Play/Test
 * simulate that arrival (see handlePlay/handleTest in SceneBuilderPage).
 */
function ScenePreview({
  nodes,
  edges,
  playToken,
  eventState,
  schedule,
  clockMs,
  urls
}: {
  nodes: Node[]
  edges: Edge[]
  playToken: number
  eventState: PreviewEventState
  /** A running Process's resolved Tasks (see buildProcessSchedule) — empty for a scene with no Start node, in which case rendering is exactly as it always was. */
  schedule: ScheduledTask[]
  clockMs: number
  urls: OverlayUrls | null
}) {
  const map = buildNodeMap(nodes)
  const scene = nodes.find((n) => n.type === 'scene')

  if (!scene) {
    const box = nodes.find((n) => n.type === 'box')
    const images = nodes.filter((n) => n.type === 'image')
    const videos = nodes.filter((n) => n.type === 'video')
    const texts = nodes.filter((n) => n.type === 'text')
    return (
      <div
        className="flex flex-col items-center gap-2"
        style={
          box
            ? {
                background: (box.data.background as string) || '#18181b',
                padding: `${(box.data.paddingY as number) ?? 12}px ${(box.data.paddingX as number) ?? 16}px`,
                borderRadius: `${(box.data.borderRadius as number) ?? 10}px`,
                border: box.data.borderEnabled
                  ? `${(box.data.borderWidth as number) ?? 2}px solid ${(box.data.borderColor as string) || '#ffffff'}`
                  : undefined
              }
            : undefined
        }
      >
        {images.map((n) => (
          <ImageView key={`${n.id}-${playToken}`} node={n} style={{}} anim={null} played={playToken > 0} hiding={false} urls={urls} audioCover={false} />
        ))}
        {videos.map((n) => (
          <VideoView key={`${n.id}-${playToken}`} node={n} style={{}} anim={null} played={playToken > 0} hiding={false} />
        ))}
        {texts.map((n) => (
          <TextView key={`${n.id}-${playToken}`} node={n} style={{}} anim={null} played={playToken > 0} hiding={false} vars={null} audioValues={null} crossAxis="horizontal" />
        ))}
      </div>
    )
  }

  if (eventState.active && !eventState.visible) {
    return (
      <span className="text-white/40 text-xs text-center px-4">
        {/* alertTypes is empty when armed purely by Audio Player (no Event — see processTrigger's audioArmed), which has no "type" to name — describe the trigger instead of joining an empty list into a bare "Waiting for  —". */}
        Waiting for {eventState.alertTypes.length > 0 ? eventState.alertTypes.join(' / ') : 'a track change'} — press Play to simulate it.
      </span>
    )
  }

  const renderable = incoming(scene.id, edges, map).filter((n) => n.type === 'box' || n.type === 'text' || n.type === 'image' || n.type === 'video')
  const orderMods = incoming(scene.id, edges, map)
  if (renderable.length === 0) {
    return <span className="text-white/40 text-xs text-center px-4">Nothing connected to Scene yet — wire a Text, Image, Video or Shape into it.</span>
  }

  const played = eventState.active || playToken > 0
  const hiding = eventState.active && eventState.hiding
  const crossAxis = crossAxisFor(orderMods)

  return (
    <div
      className={cn('relative w-full h-full flex items-center justify-center', orderingClass(orderMods))}
      style={{ gap: `${orderingGap(orderMods)}px` }}
    >
      {renderable.map((n) =>
        n.type === 'box' ? (
          <BoxView
            key={`${n.id}-${playToken}`}
            node={n}
            edges={edges}
            map={map}
            playToken={playToken}
            played={played}
            hiding={hiding}
            vars={eventState.vars}
            schedule={schedule}
            clockMs={clockMs}
            urls={urls}
          />
        ) : (
          <ContentView
            key={`${n.id}-${playToken}`}
            node={n}
            edges={edges}
            map={map}
            playToken={playToken}
            played={played}
            hiding={hiding}
            vars={eventState.vars}
            schedule={schedule}
            clockMs={clockMs}
            urls={urls}
            crossAxis={crossAxis}
          />
        )
      )}
    </div>
  )
}

export function SceneBuilderPage({
  customOverlayId,
  onNavigate
}: {
  customOverlayId?: string
  onNavigate: (key: NavKey) => void
}) {
  const { resolvedThemeId, themes } = useTheme()
  const isDark = themes.find((t) => t.id === resolvedThemeId)?.mode === 'dark'

  const { overlays, saveOverlay, deleteOverlay, testOverlay } = useCustomOverlays()
  const { start: startTour } = useTour()

  const overlay = customOverlayId ? overlays.find(o => o.id === customOverlayId) : undefined

  const [nodes, setNodes] = useState<Node[]>(defaultNodes)
  const [edges, setEdges] = useState<Edge[]>(defaultEdges)
  const [nameInput, setNameInput] = useState('')
  const [urlKeyInput, setUrlKeyInput] = useState('')
  const [urlKeyError, setUrlKeyError] = useState<string | null>(null)
  /**
   * Permalink-style follow: while false, the URL key auto-updates to track
   * the Name as you type it (see the name input's onChange below), so the
   * page address matches the scene name by default. The moment the URL key
   * field itself is edited it locks (true) and stops following further name
   * edits, protecting a Browser Source already pointed at that address from
   * silently breaking on a later rename.
   */
  const [urlKeyLocked, setUrlKeyLocked] = useState(false)
  const [urls, setUrls] = useState<OverlayUrls | null>(null)
  // Every Add Node group starts collapsed — the palette lists every node
  // type across every group up front otherwise, which is a lot to scan past
  // just to find one node in one group.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PALETTE_GROUPS.map((group) => [group, true]))
  )
  const [playToken, setPlayToken] = useState(0)
  /**
   * Phase of a simulated (Play) event for an event-triggered Scene — see
   * sceneTrigger. 'idle': waiting, nothing rendered. 'showing': revealed,
   * entrance played. 'hiding': exit animation playing (content stays
   * mounted so it can) — see maxExitDurationMs and PreviewEventState.
   */
  const [eventPhase, setEventPhase] = useState<'idle' | 'showing' | 'hiding'>('idle')
  const [eventVars, setEventVars] = useState<Record<string, unknown> | null>(null)
  const eventHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Captured via onInit below — SceneBuilderPage renders <ReactFlow> itself rather than being a descendant of it, so useReactFlow() isn't available here directly; this ref is the standard workaround for reaching imperative methods (fitView, see handlePrettify) from outside the flow tree. */
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null)

  /**
   * Width (px) of the canvas wrapper itself — NOT window.innerWidth, since
   * this page sits next to the app's own sidebar/titlebar chrome and the
   * three floating toolbar/palette/preview <Panel>s are positioned relative
   * to this element, not the viewport. The three panels have no knowledge of
   * each other's size (React Flow's Panel does plain corner positioning, no
   * collision avoidance), so at narrow widths the centered toolbar's own
   * min-width runs into the pinned side panels and gets painted over by
   * whichever renders later in the DOM — see isCompact/isNarrow below for
   * the fix. null until the first ResizeObserver callback fires, in which
   * case every panel renders at its normal (wide-window) layout rather than
   * flashing hidden for one frame.
   */
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = canvasWrapperRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width != null) setContainerWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  /**
   * Below this, the top-right live preview is hidden — it's a decorative
   * mirror of the real overlay (Test/Play already exercise the real thing),
   * the first thing worth giving up when space is tight. The centered
   * toolbar is a fixed 27rem (432px, see its own className comment) so it
   * clears BOTH side panels at once (Add Node ~200px + preview ~336px)
   * only once the canvas is roughly 432 + 2*216 + margins ≈ 1120px —
   * that's where this threshold comes from, not an arbitrary guess.
   */
  const isCompact = containerWidth !== null && containerWidth < 1120
  /**
   * Below this, even the Add Node palette (already the narrowest of the
   * three panels) collapses into a toggle button — see the paletteOpen
   * state below. Toolbar (fixed 432px) + Add Node alone still need
   * roughly 432 + 2*200 ≈ 830px to clear each other; the app's own
   * default window (960px, minus the sidebar) lands right in this range,
   * which is exactly the overlap this was written to fix — this isn't
   * just a "very narrow window" edge case.
   */
  const isNarrow = containerWidth !== null && containerWidth < 850
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  /**
   * Width (px) of the live preview box — height follows automatically via
   * its own `aspectRatio` CSS (see the preview canvas div below), so
   * dragging the resize handle can't get the proportions wrong. Persisted
   * across sessions the same way theme/locale are (see ThemeProvider/
   * I18nProvider's own 'maddoner:*' localStorage keys) since it's a pure
   * per-user display preference, not scene content.
   */
  const [previewWidth, setPreviewWidth] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(PREVIEW_WIDTH_STORAGE_KEY))
      return Number.isFinite(stored) && stored >= MIN_PREVIEW_WIDTH && stored <= MAX_PREVIEW_WIDTH ? stored : DEFAULT_PREVIEW_WIDTH
    } catch {
      return DEFAULT_PREVIEW_WIDTH
    }
  })
  const previewResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  /**
   * The preview panel is anchored top-right (position="top-right"), so its
   * top and right edges never move — only a drag on its BOTTOM-LEFT corner
   * reads naturally as "resize" here, growing/shrinking by moving the left
   * edge left/right while width (and, via aspect-ratio, height) follow.
   * Tracked via window-level listeners rather than the handle's own
   * onMouseMove, since the pointer easily outruns a 14px grip mid-drag.
   */
  const handlePreviewResizeStart = (event: React.MouseEvent): void => {
    event.preventDefault()
    previewResizeRef.current = { startX: event.clientX, startWidth: previewWidth }
    const onMove = (moveEvent: MouseEvent): void => {
      const drag = previewResizeRef.current
      if (!drag) return
      const next = drag.startWidth + (drag.startX - moveEvent.clientX)
      setPreviewWidth(Math.min(MAX_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, next)))
    }
    const onUp = (): void => {
      previewResizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setPreviewWidth((width) => {
        try {
          localStorage.setItem(PREVIEW_WIDTH_STORAGE_KEY, String(width))
        } catch {
          // Preview size just won't persist across restarts in this environment.
        }
        return width
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /** Current playhead (ms) of a simulated Process run (see buildProcessSchedule) — advanced via rAF by handlePlay, consumed by ScenePreview/BoxView/ContentView through computeTaskState. Only meaningful while eventPhase is 'showing' for a Scene with a Start node. The process itself lives directly in nodes/edges (Start/Task/Wait/End are graph nodes) — no separate state to load/save. */
  const [processClockMs, setProcessClockMs] = useState(0)
  const processRafRef = useRef<number | null>(null)
  /** Pending setTimeouts for a simulated Process run's own per-Task Sound previews (see TASK_SOCKETS' own doc comment in components/nodes/index.tsx) — tracked and cleared on every new Play so pressing it again mid-run can't leave an old run's sounds to fire late on top of the new one. */
  const taskSoundTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    window.maddoner.getOverlayUrls().then(setUrls)
  }, [])

  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig>(DEFAULT_CANVAS_CONFIG)
  useEffect(() => {
    window.maddoner.getCanvasConfig().then(setCanvasConfig)
  }, [])

  useEffect(() => {
    return () => {
      if (processRafRef.current != null) cancelAnimationFrame(processRafRef.current)
      taskSoundTimersRef.current.forEach(clearTimeout)
    }
  }, [])

  useEffect(() => {
    if (overlay) {
      const isBlank = !overlay.nodes || overlay.nodes.length === 0
      setNodes(isBlank ? defaultNodes : overlay.nodes)
      setEdges(isBlank ? defaultEdges : migrateLegacyAudioPlayerEdges(migrateLegacyModifierEdges(overlay.edges || [])))
      setNameInput(overlay.name)
      setUrlKeyInput(overlay.urlKey)
      setUrlKeyError(null)
      // A urlKey that doesn't match what a fresh slugify(name) would produce
      // means it was deliberately customized (or auto-suffixed for a
      // collision) at some point — treat that as already locked rather than
      // silently resyncing it the next time the name changes.
      setUrlKeyLocked(overlay.urlKey !== slugify(overlay.name))
    } else {
      setNodes(defaultNodes)
      setEdges(defaultEdges)
    }
  }, [overlay?.id])

  const commitName = (): void => {
    if (!overlay) return
    const name = nameInput.trim()
    if (!name) {
      setNameInput(overlay.name)
      return
    }
    setNameInput(name)

    // Still following: the URL key moves with the name, same as the live
    // preview while typing (see the name input's onChange) — recomputed here
    // (rather than trusting urlKeyInput) so it reflects the final trimmed
    // name and a fresh uniqueness check.
    if (!urlKeyLocked) {
      const key = uniqueUrlKey(name, overlays.filter((o) => o.id !== overlay.id).map((o) => o.urlKey))
      setUrlKeyInput(key)
      if (name === overlay.name && key === overlay.urlKey) return
      void saveOverlay({ ...overlay, name, urlKey: key })
      return
    }

    if (name === overlay.name) return
    void saveOverlay({ ...overlay, name })
  }

  const commitUrlKey = (): void => {
    if (!overlay) return
    const key = slugify(urlKeyInput)
    if (key === overlay.urlKey) {
      setUrlKeyInput(key)
      setUrlKeyError(null)
      return
    }
    if (overlays.some((o) => o.id !== overlay.id && o.urlKey === key)) {
      setUrlKeyError('This key is already used by another scene.')
      return
    }
    setUrlKeyInput(key)
    setUrlKeyError(null)
    void saveOverlay({ ...overlay, urlKey: key })
  }

  const handleDelete = async (): Promise<void> => {
    if (!overlay) return
    if (!window.confirm(`Delete scene "${overlay.name}"? This cannot be undone.`)) return
    await deleteOverlay(overlay.id)
    onNavigate('dashboard')
  }

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'error'>('idle')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  /** Persists the current nodes/edges — a Start/Task/Wait/End process lives directly in them, no separate state to save. */
  const handleSave = async (): Promise<void> => {
    if (!overlay) return
    setSaveStatus('saving')
    try {
      await saveOverlay({ ...overlay, nodes, edges })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

  /**
   * Live-previews the CURRENT graph (including anything not yet Saved) in
   * any real OBS Browser Source/browser tab already pointed at this scene's
   * URL — see CustomOverlaysProvider.testOverlay / OverlayServer.testCustomOverlay.
   * Distinct from Save: this replays entrance animations and fires a fresh
   * (non-repeating) Background FX drop, Save deliberately does not — see the
   * doc comment on OverlayServer.setCustomOverlays. Purely a broadcast — it
   * doesn't open anything itself, so it's a no-op if nothing is connected.
   */
  const handleTest = async (): Promise<void> => {
    if (!overlay) return
    setTestStatus('testing')
    try {
      await testOverlay({ ...overlay, nodes, edges })
      setTestStatus('idle')
    } catch {
      setTestStatus('error')
      setTimeout(() => setTestStatus('idle'), 2000)
    }
  }

  /**
   * One-shot auto-arrange via layoutGraph (dagre) — only touches local
   * editor state (`nodes`), same as dragging a node by hand; nothing is
   * persisted until Save, so it's always safe to try and undo by just not
   * saving. The double rAF before fitView gives React (and ReactFlow's own
   * internal node measurement) one full paint cycle to actually apply the
   * new positions before the camera tries to frame them — calling fitView
   * synchronously right after setNodes would still see the OLD layout.
   */
  const handlePrettify = (): void => {
    setNodes((nds) => layoutGraph(nds, edges))
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        reactFlowInstanceRef.current?.fitView({ duration: 300, padding: 0.15 })
      })
    })
  }

  /**
   * Plays the preview once: bumps playToken (remounts every animated node —
   * see the playToken-keyed lists in ScenePreview/BoxView — which is what
   * actually restarts their CSS entrance animation) and fires whatever Sound
   * node is wired into Scene/Start, the same bundled-preset URL scheme as
   * AlertSoundPicker's own preview button.
   *
   * A Start node (processTrigger) takes priority over the plain
   * Event+Timer→Scene model (sceneTrigger) — see the doc
   * comment on nodeTypes in components/nodes/index.tsx. Either way this
   * simulates the event: for a Process, advances processClockMs via rAF
   * from 0 to the schedule's totalMs, each component resolving its own
   * state through computeTaskState; for the plain model, the simpler
   * show-for-durationMs-then-play-one-exit-animation flow this already had.
   * Both are the local equivalent of a real alert arriving, and of what
   * Test simulates for the real overlay (see handleTest /
   * overlays/custom.html's processTrigger/isEventTrigger).
   */
  /** Plays one Sound node's configured preset/custom file — shared by handlePlay's Start/Scene-level preview below and its per-Task one. */
  const playSoundNode = (soundNode: Node | undefined): void => {
    if (!urls) return
    const soundId = (soundNode?.data.soundId as string) || 'none'
    if (soundId === 'none') return
    const customSoundName = soundNode?.data.customSoundName as string | undefined
    if (soundId === 'custom' && !customSoundName) return
    const soundUrl =
      soundId === 'custom'
        ? `http://${urls.host}:${urls.port}/overlays/custom-sounds/${encodeURIComponent(customSoundName!)}`
        : `http://${urls.host}:${urls.port}/overlays/sounds/${soundId}.wav`
    const audio = new Audio(soundUrl)
    audio.volume = (soundNode?.data.volume as number) ?? 1
    void audio.play().catch(() => {})
  }

  const handlePlay = (): void => {
    setPlayToken((t) => t + 1)
    const proc = processTrigger(nodes, edges)
    const trigger = proc.active ? null : sceneTrigger(nodes, edges)
    if (proc.active || trigger?.active) {
      if (eventHideTimerRef.current) clearTimeout(eventHideTimerRef.current)
      if (eventIdleTimerRef.current) clearTimeout(eventIdleTimerRef.current)
      if (processRafRef.current != null) cancelAnimationFrame(processRafRef.current)
      taskSoundTimersRef.current.forEach(clearTimeout)
      taskSoundTimersRef.current = []
      // Sample data shaped to whichever trigger is actually armed — mirrors
      // render()'s own simulateTest branch in overlays/custom.html: a
      // process armed purely by Audio Player (proc.audioArmed, no Event —
      // see processTrigger) gets Now-Playing-shaped sample vars instead of
      // alert-shaped ones, or a Task's own {title}/{artist} placeholders
      // would just preview as literal text. alertTypes wins when both are
      // wired to the same Start.
      const alertTypes = proc.active ? proc.alertTypes : trigger!.alertTypes
      setEventVars(alertTypes.length > 0 ? { type: alertTypes[0], ...SAMPLE_ALERT_VARS } : { ...SAMPLE_AUDIO_VARS, source: 'spotify', isPlaying: true })
      setEventPhase('showing')
      if (proc.active) {
        const built = buildProcessSchedule(nodes, edges)
        const totalMs = built?.totalMs ?? 0
        // See processExitBufferMs's own doc comment: without the buffer,
        // whichever Task(s) fire at exactly totalMs get cut off before
        // their animation plays a single frame.
        const total = totalMs + processExitBufferMs(built?.schedule ?? [], totalMs)
        const start = performance.now()
        setProcessClockMs(0)
        // Every Task's own Sound (see TASK_SOCKETS' own doc comment in
        // components/nodes/index.tsx), previewed at the same atMs its Task
        // fires at — mirrors showProcessContent's soundsByAtMs in
        // overlays/custom.html, just via setTimeout instead of the rAF
        // clock driving processClockMs (a Sound isn't part of a
        // component's resolved style, so it doesn't need per-frame
        // resolution the way computeTaskState's targets do).
        for (const s of built?.schedule ?? []) {
          const soundMod = s.mods.find((m) => m.type === 'sound')
          if (!soundMod) continue
          if (s.atMs === 0) {
            playSoundNode(soundMod)
          } else {
            taskSoundTimersRef.current.push(setTimeout(() => playSoundNode(soundMod), s.atMs))
          }
        }
        const tick = (now: number): void => {
          const elapsed = now - start
          if (elapsed >= total) {
            setProcessClockMs(total)
            setEventPhase('idle')
            processRafRef.current = null
            return
          }
          setProcessClockMs(elapsed)
          processRafRef.current = requestAnimationFrame(tick)
        }
        processRafRef.current = requestAnimationFrame(tick)
      } else {
        eventHideTimerRef.current = setTimeout(() => {
          setEventPhase('hiding')
          eventIdleTimerRef.current = setTimeout(() => setEventPhase('idle'), maxExitDurationMs(nodes, edges))
        }, trigger!.durationMs)
      }
    }
    const map = buildNodeMap(nodes)
    const start = nodes.find((n) => n.type === 'start')
    const scene = nodes.find((n) => n.type === 'scene')
    const soundNode = start
      ? incoming(start.id, edges, map).find((n) => n.type === 'sound')
      : scene
        ? incoming(scene.id, edges, map).find((n) => n.type === 'sound')
        : nodes.find((n) => n.type === 'sound')
    playSoundNode(soundNode)
  }

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds))
    },
    []
  )
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds))
    },
    []
  )
  /**
   * Blender-style single-value sockets: dropping a new wire onto a socket
   * that isn't `multi` (see NODE_SOCKETS in components/nodes) bumps
   * whatever was already plugged into it instead of stacking both — same
   * behavior Blender uses for single-value inputs. `multi` sockets (Box's
   * Children, Scene's Content) accept any number of wires unchanged. The
   * process sequence-flow socket (event-in) isn't in NODE_SOCKETS but is
   * conceptually single too — a step has exactly one predecessor.
   */
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const targetNode = nodes.find((n) => n.id === params.target)
        const socket = targetNode ? NODE_SOCKETS[targetNode.type!]?.find((s) => s.id === params.targetHandle) : undefined
        const multi = params.targetHandle !== 'event-in' && Boolean(socket?.multi)
        const base = multi ? eds : eds.filter((e) => !(e.target === params.target && e.targetHandle === params.targetHandle))
        return addEdge(params, base)
      })
    },
    [nodes]
  )

  /**
   * Keeps the Event socket (sequence flow, id "event-in" — see BaseNode's
   * sequenceIn) strictly for connecting one process step to the next: only
   * a Start/Task/Wait/End can feed it. Every other socket is validated
   * against NODE_SOCKETS' accepts list for the target node's type/socket —
   * the same list BaseNode itself reads to render each socket, so a process
   * node's output (never in any accepts list) naturally can't land on a
   * plain parameter socket either, without needing a separate check. For a
   * source node with its own NODE_OUTPUTS (Text/Image/Box), the SPECIFIC
   * output socket used also has to list the target socket in its `feeds` —
   * e.g. dragging from Box's "As Target" dot can only land on a Task's
   * Target socket, not Scene's Content, even though a plain Box is
   * otherwise allowed there via the "Structural" output.
   */
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return false
      if (connection.targetHandle === 'event-in') return PROCESS_TYPES.has(sourceNode.type!)
      const socket = NODE_SOCKETS[targetNode.type!]?.find((s) => s.id === connection.targetHandle)
      if (!socket || !socket.accepts.includes(sourceNode.type!)) return false
      const outputSockets = NODE_OUTPUTS[sourceNode.type!]
      if (outputSockets) {
        const outSocket = outputSockets.find((o) => o.id === connection.sourceHandle)
        if (!outSocket || !outSocket.feeds.includes(connection.targetHandle!)) return false
      }
      // Box can now nest Box (see BOX_SOCKETS' own doc comment in
      // components/nodes/index.tsx) — the one connection shape in this
      // whole graph that CAN form a cycle (Box A contains Box B contains
      // Box A), which would recurse forever in BoxView/buildBox. Reject a
      // Box→Box `children` connection if the target is already a
      // descendant of the source — i.e. the source already (transitively)
      // contains the target, so wiring the target to also contain the
      // source would close the loop.
      if (sourceNode.type === 'box' && targetNode.type === 'box' && connection.targetHandle === 'children') {
        const stack = [sourceNode.id]
        const seen = new Set<string>()
        while (stack.length) {
          const id = stack.pop()!
          if (id === targetNode.id) return false
          if (seen.has(id)) continue
          seen.add(id)
          for (const e of edges) {
            if (e.target === id && e.targetHandle === 'children' && nodes.find((n) => n.id === e.source)?.type === 'box') {
              stack.push(e.source)
            }
          }
        }
      }
      return true
    },
    [nodes, edges]
  )

  const onEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id))
    },
    []
  )

  const addNode = (type: string, position: { x: number; y: number }) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      // Spread a fresh copy of NODE_DEFAULTS[type] (rather than the same
      // object reference) so editing this node's data can never mutate the
      // shared defaults for every other node of this type.
      data: { ...(NODE_DEFAULTS[type] ?? {}) }
    }
    setNodes((nds) => [...nds, newNode])
  }

  // Drag-and-drop from the Add Node palette — see the palette buttons'
  // draggable/onDragStart below and the canvas wrapper's onDrop/onDragOver.
  // The palette button's own type is passed via dataTransfer rather than
  // closed over, since the drop handler is bound once on the canvas
  // wrapper, not per palette entry.
  const onPaletteDragStart = (event: React.DragEvent, type: string) => {
    event.dataTransfer.setData('application/reactflow', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onCanvasDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onCanvasDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/reactflow')
      if (!type || !reactFlowInstanceRef.current) return
      const position = reactFlowInstanceRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      })
      addNode(type, position)
    },
    []
  )

  if (!overlay) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
        <Workflow className="w-16 h-16 mb-4 opacity-50" />
        <h2 className="text-xl font-semibold text-foreground">No Scene Selected</h2>
        <p className="mt-2 text-center max-w-sm">
          Please select an overlay from the sidebar or create a new one using the "+" button under "Overlays".
        </p>
      </div>
    )
  }

  const backgroundFxNode = findBackgroundFx(nodes, edges)
  // A Start node (processTrigger) takes priority over the plain
  // Event+Timer→Scene model (sceneTrigger) — see the doc
  // comment on nodeTypes in components/nodes/index.tsx.
  const proc = processTrigger(nodes, edges)
  const trigger = proc.active ? null : sceneTrigger(nodes, edges)
  const eventActive = proc.active || Boolean(trigger?.active)
  const eventState: PreviewEventState = {
    active: eventActive,
    visible: eventPhase !== 'idle',
    hiding: eventPhase === 'hiding',
    vars: eventActive ? eventVars : null,
    alertTypes: proc.active ? proc.alertTypes : (trigger?.alertTypes ?? [])
  }
  const processSchedule = proc.active ? (buildProcessSchedule(nodes, edges)?.schedule ?? []) : []
  // Background FX cuts instantly on hide rather than riding out the content's
  // exit animation — mirrors overlays/custom.html's hideTriggeredContent,
  // which calls applyBackgroundFx(undefined, ...) before playExitAnimations.
  const previewPlayed = eventState.active ? eventPhase === 'showing' : playToken > 0

  return (
    <div
      ref={canvasWrapperRef}
      className="w-full h-full relative bg-background"
      data-tour="scene-builder-canvas"
      onDragOver={onCanvasDragOver}
      onDrop={onCanvasDrop}
    >
      <SavedNodeDataProvider savedNodes={overlay.nodes}>
      <ReactFlow
          nodes={nodes}
          edges={displayEdges(nodes, edges)}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          // Default is 20px — bumped up since sockets are small, densely
          // labeled rows (see SocketRow/OutputRow in components/nodes/
          // index.tsx): this is how forgiving the DROP end of a drag is,
          // once it's already under way (the .react-flow__handle::after
          // rule in scene-builder-canvas.css is what forgives the START).
          connectionRadius={40}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance
          }}
          nodeTypes={nodeTypes}
          colorMode={isDark ? 'dark' : 'light'}
          fitView
          className="bg-background"
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={minimapNodeColor}
            maskColor="rgba(0, 0, 0, 0.6)"
            pannable
            zoomable
            className="!bg-card !border !border-border"
          />
          {/* Floating toolbar — name, URL key, and the save/prettify/test/help/delete actions — centered above the canvas instead of a full-width bar above it, now that the canvas itself fills the whole page. Delete sits apart from the rest (top-right, next to the name) since it's destructive and shouldn't be one click away from Save/Prettify/Test/Help, which live together in a footer row instead. */}
          {/*
            w-[27rem], not min-w: a shrink-to-fit (auto) width here made the
            URL-key row's own flex-wrap useless — an auto-width flex-col
            parent sizes itself off row 1/3's shorter content, then row 2
            (label + url-key input + the CopyableUrl address, which needs
            ~27rem to lay out on one line) gets stretched to that narrower
            auto-computed width and simply overflows past this panel's own
            edge instead of wrapping, since flex-wrap only wraps against a
            container's REAL resolved width, not one still being
            auto-computed from shorter sibling rows. An explicit width
            removes that ambiguity — 27rem is row 2's own natural width, so
            normally nothing wraps and the URL shows in full; max-w clamps
            it smaller on a narrow canvas, and THEN flex-wrap correctly
            drops the URL box to its own line within that resolved width
            (see isNarrow/isCompact's own doc comment for how the two
            side panels' collapse thresholds account for this width).
          */}
          <Panel position="top-center" className="mt-3 w-[27rem] max-w-[calc(100%-2rem)] bg-card border rounded-xl shadow-md px-4 py-3.5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <input
                value={nameInput}
                onChange={(e) => {
                  const value = e.target.value
                  setNameInput(value)
                  if (!urlKeyLocked) setUrlKeyInput(slugify(value))
                }}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') {
                    setNameInput(overlay.name)
                    if (!urlKeyLocked) setUrlKeyInput(overlay.urlKey)
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                aria-label="Scene name"
                className="min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-tight text-foreground outline-none border-b border-transparent rounded-sm px-0.5 -mx-0.5 hover:border-border focus:border-primary transition-colors"
              />
              <button
                onClick={() => void handleDelete()}
                title="Delete Scene"
                className="flex items-center justify-center p-2 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-muted-foreground shrink-0" htmlFor="scene-url-key" title="URL key">
                  URL key:
                </label>
                <input
                  id="scene-url-key"
                  value={urlKeyInput}
                  onChange={(e) => {
                    setUrlKeyLocked(true)
                    setUrlKeyInput(e.target.value)
                  }}
                  onBlur={commitUrlKey}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  className="bg-muted border rounded px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-primary w-24 shrink-0"
                />
                {urls && (
                  <div className="min-w-0 flex-1" data-tour="scene-builder-url">
                    <CopyableUrl
                      url={`${urls.customBase}/${encodeURIComponent(overlay.urlKey)}.html`}
                      className="max-w-[220px]"
                    />
                  </div>
                )}
              </div>
              {urlKeyError && <p className="text-xs text-destructive">{urlKeyError}</p>}
            </div>

            <div className="flex items-center justify-between pt-2.5 border-t" data-tour="scene-builder-save">
              <button
                onClick={handlePrettify}
                title="Prettify — auto-arranges the node graph for readability (dagre layered layout). Only rearranges nodes locally; Save to keep it."
                className="flex items-center justify-center p-2 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Sparkles className="size-4" />
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => void handleSave()}
                  disabled={saveStatus === 'saving'}
                  className={cn(
                    'flex items-center gap-1.5 text-sm font-semibold py-2 px-3.5 rounded-md transition-colors disabled:cursor-wait',
                    saveStatus === 'saved' && 'bg-green-600 hover:bg-green-600 text-white',
                    saveStatus === 'error' && 'bg-destructive hover:bg-destructive text-destructive-foreground',
                    (saveStatus === 'idle' || saveStatus === 'saving') && 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  )}
                >
                  {saveStatus === 'saved' && <Check className="size-4" />}
                  {saveStatus === 'error' && <X className="size-4" />}
                  {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : 'Save'}
                </button>
                <button
                  onClick={() => void handleTest()}
                  disabled={testStatus === 'testing'}
                  title="Test — plays this scene (including unsaved changes) live in any connected Browser Source, without saving"
                  className={cn(
                    'flex items-center justify-center p-2 rounded-md border transition-colors disabled:cursor-wait',
                    testStatus === 'error'
                      ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {testStatus === 'error' ? <X className="size-4" /> : <FlaskConical className="size-4" />}
                </button>
              </div>
              <button
                onClick={() => startTour('sceneBuilder')}
                title="Tutorial — a detailed walkthrough of Scene Builder's own mechanics"
                className="flex items-center justify-center p-2 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <HelpCircle className="size-4" />
              </button>
            </div>
          </Panel>
          {/* max-h leaves real clearance at the bottom for <Controls> (also bottom-left, ~9rem tall including its own margin) — a smaller, reliably-scrollable panel instead of one that stretches to nearly the full canvas height and overlaps it.
              Below isNarrow, the panel itself collapses to just a toggle button (paletteOpen) instead of staying permanently pinned — freeing up the width the centered toolbar above needs so the two stop painting over each other on a narrow window (see containerWidth's own doc comment). */}
          <Panel position="top-left" data-tour="scene-builder-add-node" className="m-4 flex flex-col items-start gap-2">
            {isNarrow && (
              <button
                type="button"
                onClick={() => setPaletteOpen((open) => !open)}
                title={paletteOpen ? 'Hide node palette' : 'Show node palette'}
                className="flex items-center justify-center p-2.5 rounded-lg border bg-card shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <PanelLeft className="size-4" />
              </button>
            )}
            {(!isNarrow || paletteOpen) && (
              <div className="bg-card border rounded-lg shadow-sm flex flex-col min-w-[170px] max-h-[min(28rem,calc(100%_-_9rem))] overflow-hidden">
                <div className="p-2.5 border-b bg-card shrink-0">
                  <h3 className="font-semibold text-sm text-center">Add Node</h3>
                </div>
                <ScrollArea className="flex-1 min-h-0 my-3">
                  <div className="flex flex-col gap-1 px-3">
                    {PALETTE_GROUPS.map((group) => {
                      const entries = NODE_PALETTE.filter((entry) => entry.group === group)
                      const isOpen = !collapsedGroups[group]
                      // Every entry in a palette group shares one NodeCategory
                      // (e.g. "Transform" is entirely 'style', "Data" entirely
                      // 'data') — see NODE_CATEGORY's own doc comment — so one
                      // lookup colors both the group header and every button in
                      // it, matching the exact tint/accent that node gets once
                      // it's actually placed on the canvas (BaseNode's own
                      // header styling, CATEGORY_STYLES in components/nodes).
                      const categoryStyle = CATEGORY_STYLES[NODE_CATEGORY[entries[0].type]]
                      return (
                        <div key={group} className="flex flex-col gap-1">
                          <button
                            onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))}
                            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground cursor-pointer py-0.5"
                          >
                            <ChevronRight className={cn('size-3 transition-transform', isOpen && 'rotate-90')} />
                            <span className={cn('size-1.5 rounded-full shrink-0', categoryStyle.dot)} />
                            {group}
                          </button>
                          {isOpen &&
                            entries.map((entry) => (
                              <button
                                key={entry.type}
                                type="button"
                                draggable
                                onDragStart={(e) => onPaletteDragStart(e, entry.type)}
                                title="Drag onto the canvas to add"
                                className={cn(
                                  'text-xs py-2 px-3 rounded border-l-4 transition-all text-left border border-transparent hover:border-border hover:brightness-110 cursor-grab active:cursor-grabbing',
                                  categoryStyle.header,
                                  categoryStyle.border
                                )}
                              >
                                {entry.label}
                              </button>
                            ))}
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </Panel>
          {/* Below isCompact, this collapses to just a toggle button (previewOpen) instead of vanishing outright — same pattern as the Add Node palette above, so there's always a visible way to bring it back rather than it just disappearing. */}
          <Panel position="top-right" data-tour="scene-builder-preview" className="m-4 flex flex-col items-end gap-2">
            {isCompact && (
              <button
                type="button"
                onClick={() => setPreviewOpen((open) => !open)}
                title={previewOpen ? 'Hide preview' : 'Show preview'}
                className="flex items-center justify-center p-2.5 rounded-lg border bg-card shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <PanelRight className="size-4" />
              </button>
            )}
            {(!isCompact || previewOpen) && (
            <div
              className="scene-preview-canvas isolate border border-border rounded-lg overflow-hidden relative flex items-center justify-center pointer-events-none opacity-90"
              style={{
                width: previewWidth,
                aspectRatio: canvasConfig.aspectRatio === 'custom'
                  ? `${canvasConfig.width}/${canvasConfig.height}`
                  : canvasConfig.aspectRatio.replace(':', '/')
              }}
            >
              <div className="absolute z-10 top-2 right-2 flex items-center gap-1.5 bg-black/70 rounded-full pl-2.5 pr-1 py-1">
                <span className="text-white text-xs font-medium">Preview</span>
                <button
                  type="button"
                  onClick={handlePlay}
                  title="Play animations & sound"
                  className="pointer-events-auto flex items-center justify-center size-5 rounded-full bg-white/15 text-white hover:bg-white/30 transition-colors cursor-pointer"
                >
                  <Play className="size-3 fill-current" />
                </button>
              </div>
              {/* Bottom-left corner: the one corner that actually moves as this top-right-anchored box grows/shrinks — see handlePreviewResizeStart's own doc comment. */}
              <div
                onMouseDown={handlePreviewResizeStart}
                title="Drag to resize preview"
                className="pointer-events-auto absolute z-10 bottom-0 left-0 size-4 cursor-sw-resize flex items-end justify-start p-0.5 opacity-60 hover:opacity-100 transition-opacity"
              >
                <div className="size-2 border-b-2 border-l-2 border-white/80 rounded-bl-sm" />
              </div>
              <div
                // shrink-0 is the actual fix (see the diagnostic session
                // that found this): this div is a flex ITEM of the
                // .scene-preview-canvas flex container above (width:
                // previewWidth, user-resizable — see handlePreviewResizeStart).
                // Without shrink-0, flexbox's default flex-shrink:1
                // compresses this box's WIDTH down to fit that container
                // BEFORE the scale() transform below even runs — squashing
                // it down from the real 1920px, while height stays correct
                // (cross-axis, unaffected by flex-shrink under
                // items-center). Content that just centers within whatever
                // width it gets (the alert box) tolerated this well enough
                // to look "mostly fine"; a percentage-sized background
                // (background-size: 200% 200%, the 'gradient' Background FX
                // type) is far more sensitive to the exact width and
                // rendered as a narrow off-proportion band instead of a
                // full-canvas sweep.
                className="relative origin-center overflow-hidden shrink-0"
                style={{
                  width: canvasConfig.width,
                  height: canvasConfig.height,
                  transform: `scale(${previewWidth / canvasConfig.width})`
                }}
              >
                <BackgroundFxLayer
                  node={backgroundFxNode}
                  label={findBackgroundFxLabel(backgroundFxNode, nodes, edges, eventState.vars)}
                  urls={urls}
                  playToken={playToken}
                  played={previewPlayed}
                />
                <ScenePreview
                  nodes={nodes}
                  edges={edges}
                  playToken={playToken}
                  eventState={eventState}
                  schedule={processSchedule}
                  clockMs={processClockMs}
                  urls={urls}
                />
              </div>
            </div>
            )}
          </Panel>
        </ReactFlow>
      </SavedNodeDataProvider>
    </div>
  )
}
