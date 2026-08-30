import { Node, Edge, MarkerType, getBezierPath, Position } from "@xyflow/react";
import dagre from "dagre";
import { NODE_OUTPUTS } from "@/components/nodes";


export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'


export type NodeMap = Record<string, Node>


export function buildNodeMap(nodes: Node[]): NodeMap {
  return Object.fromEntries(nodes.map((n) => [n.id, n]))
}


/** Nodes wired directly INTO `nodeId` — see the direction doc comment in components/nodes/index.tsx. Sorted by `data.priority` (lower = rendered first) so the in-editor priority badges control render order. */
export function incoming(nodeId: string, edges: Edge[], map: NodeMap): Node[] {
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
export function lastOfType(mods: Node[], type: string): Node | undefined {
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
export const LEGACY_MODIFIER_HANDLE_REMAP: Record<string, string> = {
  position: 'transform',
  size: 'transform',
  opacity: 'style',
  shadow: 'style',
  animation: 'style',
  hide: 'style'
}

export function migrateLegacyModifierEdges(edges: Edge[]): Edge[] {
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
export const LEGACY_AUDIO_PLAYER_SOURCE_HANDLE_REMAP: Record<string, string> = {
  author: 'content',
  title: 'content',
  cover: 'content',
  trackChanged: 'event',
  feed: 'event'
}

export function migrateLegacyAudioPlayerEdges(edges: Edge[]): Edge[] {
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
export const SAMPLE_ALERT_VARS = { user: 'Viewer', amount: 25, message: 'Sample message', source: 'twitch' }


/**
 * Sample now-playing vars for previewing an Audio Player's Content/Event
 * outputs (see AUDIO_PLAYER_OUTPUTS in components/nodes) in the editor —
 * there's no live now-playing feed inside the builder (unlike the real
 * overlay, which gets one over the 'now-playing' broadcast channel — see
 * overlays/custom.html), so a Text/Image wired to Content always previews
 * with this fixed sample instead. Mirrors the sample vars render() in
 * overlays/custom.html uses for its own Test-button simulation.
 */
export const SAMPLE_AUDIO_VARS = { artist: 'Sample Artist', title: 'Sample Track', albumArt: '' }


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
export function audioContentValues(nodeId: string, edges: Edge[], map: NodeMap): { artist?: string; title?: string } | null {
  const hasAudioContent = edges.some((e) => e.target === nodeId && e.targetHandle === 'content' && map[e.source]?.type === 'audioPlayer')
  return hasAudioContent ? { artist: SAMPLE_AUDIO_VARS.artist, title: SAMPLE_AUDIO_VARS.title } : null
}


/** Whether this Image's `imageContent` socket is wired to Audio Player's Content output. Mirrors hasAudioCover in overlays/custom.html. */
export function hasAudioCover(nodeId: string, edges: Edge[], map: NodeMap): boolean {
  return edges.some((e) => e.target === nodeId && e.targetHandle === 'imageContent' && map[e.source]?.type === 'audioPlayer')
}


/**
 * Whether Scene is wired to an Event node — if so, the scene is hidden
 * until a matching alert fires (for real: a live event; in the editor:
 * Play/Test simulating one), shows for `durationMs`, then hides again. See
 * EventNode/TimerNode's own doc comments in components/nodes/index.tsx,
 * and isEventTrigger — the same logic mirrored in overlays/custom.html.
 */
export function sceneTrigger(nodes: Node[], edges: Edge[]): { active: boolean; alertTypes: string[]; durationMs: number } {
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


/**
 * Whether Scene is wired to an Audio Player node via its own Event socket
 * (see the `event` entry on SCENE_SOCKETS in components/nodes/index.tsx,
 * which accepts 'audioPlayer' alongside 'event') — the continuously
 * data-driven, show-for-as-long-as-isPlaying visibility mode (see
 * AudioPlayerNode's own doc comment), mirrors isAudioTrigger in
 * overlays/custom.html. Only meaningful when sceneTrigger ISN'T already
 * active — a real Event always wins when both happen to be wired (same
 * priority order render()'s own isAudioTrigger branch uses in
 * overlays/custom.html), since the shared socket is single-value anyway.
 * Previously had no local equivalent at all — Play/Test simply did nothing
 * for a scene driven purely by Audio Player, unlike the real overlay, which
 * already simulated this via isAudioTrigger/showAudioContent.
 */
export function sceneAudioTrigger(nodes: Node[], edges: Edge[]): boolean {
  const scene = nodes.find((n) => n.type === 'scene')
  if (!scene) return false
  const map = buildNodeMap(nodes)
  return incoming(scene.id, edges, map).some((n) => n.type === 'audioPlayer')
}


/** Duration (ms) for one Animation modifier — mirrors the CSS fallback each [data-animation] rule in animations.css falls back to when the node's own Duration field is unset. */
export function animationFallbackMs(type: string): number {
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
export function maxExitDurationMs(nodes: Node[], edges: Edge[]): number {
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
    if (n.type === 'box' || n.type === 'group') {
      for (const child of mods.filter((m) => m.type === 'text' || m.type === 'image' || m.type === 'video' || m.type === 'box' || m.type === 'group')) {
        visit(child)
      }
    }
  }
  const renderable = incoming(scene.id, edges, map).filter((n) => n.type === 'box' || n.type === 'group' || n.type === 'text' || n.type === 'image' || n.type === 'video')
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
export function interpolate(template: string, vars: Record<string, unknown> | null): string {
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
export function hexToRgba(hex: string, opacityPercent: number): string {
  const clean = (hex || '#000000').replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) || 0
  const g = parseInt(clean.slice(2, 4), 16) || 0
  const b = parseInt(clean.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`
}


export function modifierStyle(mods: Node[], baseMods?: Node[]): React.CSSProperties {
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
export function borderStyle(node: Node): string | undefined {
  if (!node.data.borderEnabled) return undefined
  return `${(node.data.borderWidth as number) ?? 2}px solid ${(node.data.borderColor as string) || '#ffffff'}`
}


/** An Animation modifier wired into a node, or null if there isn't one (or it's set to "none"). */
export type Anim = { type: string; duration?: number; subType?: 'in' | 'out' } | null


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
export function animationAttrs(mods: Node[]): Anim {
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
export const PROCESS_TYPES = new Set(['start', 'task', 'wait', 'end'])


/** The next Start/Task/Wait/End node reached by following `nodeId`'s OWN sequence-flow edge forward (linear chains only — see buildProcessSchedule). */
export function nextProcessNode(nodeId: string, edges: Edge[], map: NodeMap): Node | null {
  const edge = edges.find((e) => e.source === nodeId && map[e.target] && PROCESS_TYPES.has(map[e.target].type!))
  return edge ? map[edge.target] : null
}


export const CONTENT_TYPES = new Set(['text', 'image', 'video', 'box', 'group'])

/** Box and Group — the two node types that can nest one another via their shared `children` socket (see BOX_SOCKETS' own doc comment in components/nodes/index.tsx), and so are the only ones isValidConnection's cycle guard needs to walk. */
export const CONTAINER_TYPES = new Set(['box', 'group'])

/** Same as CONTENT_TYPES plus 'scene' — used for the MiniMap's node coloring below, where Scene (never an edge SOURCE, so absent from CONTENT_TYPES) still needs to read as "content" like Text/Image/Box. */
export const CONTENT_TYPES_WITH_SCENE = new Set([...CONTENT_TYPES, 'scene'])

/** Position/Size/Transform/Animation/Hide/Display/Ordering — see NodeCategory's 'style' bucket in components/nodes/index.tsx. */
export const STYLE_TYPES = new Set(['position', 'size', 'transform', 'opacity', 'shadow', 'animation', 'hide', 'ordering'])

/** Event/Sound/Timer/Background FX/Random/Roulette/Audio Player/Range/Roulette Settings — see NodeCategory's 'data' bucket. */
export const DATA_TYPES = new Set(['event', 'sound', 'timer', 'backgroundAnimation', 'randomSource', 'rouletteSource', 'audioPlayer'])


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
export function displayEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const map = buildNodeMap(nodes)
  const result: Edge[] = []
  for (const e of edges) {
    const sourceType = map[e.source]?.type
    const targetType = map[e.target]?.type
    const outSocket = sourceType ? NODE_OUTPUTS[sourceType]?.find((o) => o.id === e.sourceHandle) : undefined
    const isContentSource = (sourceType && CONTENT_TYPES.has(sourceType)) || outSocket?.kind === 'content'

    let styled: Edge
    if (sourceType && targetType && PROCESS_TYPES.has(sourceType) && PROCESS_TYPES.has(targetType)) {
      styled = {
        ...e,
        style: { stroke: '#6366f1', strokeWidth: 3 },
        animated: true,
        zIndex: 10,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1', width: 12, height: 12 }
      }
    } else if (targetType === 'task' && isContentSource) {
      styled = {
        ...e,
        style: { stroke: '#10b981', strokeWidth: 2, strokeDasharray: '5 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981', width: 16, height: 16 }
      }
    } else if (isContentSource) {
      styled = {
        ...e,
        style: { stroke: '#10b981', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981', width: 12, height: 12 }
      }
    } else if (sourceType && STYLE_TYPES.has(sourceType)) {
      styled = {
        ...e,
        style: { stroke: '#f59e0b', strokeWidth: 1.25, strokeDasharray: '2 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 12, height: 12 }
      }
    } else if (sourceType && DATA_TYPES.has(sourceType)) {
      styled = {
        ...e,
        style: { stroke: '#0ea5e9', strokeWidth: 1.25, strokeDasharray: '2 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0ea5e9', width: 12, height: 12 }
      }
    } else {
      styled = {
        ...e,
        style: { stroke: '#94a3b8', strokeWidth: 1.25, strokeDasharray: '2 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 12, height: 12 }
      }
    }

    /**
     * A node hidden by its Frame's collapse (see FrameNode's toggleCollapse
     * in components/nodes/FrameNode.tsx) renders no Handle of its own —
     * React Flow simply drops any edge attached to a hidden node, which
     * otherwise makes a collapsed Frame's children's real connections to
     * the outside world disappear the instant it collapses. Redirect that
     * end to the Frame's own passthrough handles instead so the wire still
     * reaches (or leaves from) the group as a whole; color/style above is
     * still computed from the REAL endpoint types so a redirected wire
     * keeps telling you what kind of connection it actually is. Both ends
     * landing on the same Frame (an edge wholly INTERNAL to one collapsed
     * group) has nothing external left to show, so that edge is dropped
     * rather than drawn as a self-loop.
     */
    const sourceNode = map[e.source]
    const targetNode = map[e.target]
    let source = styled.source
    let sourceHandle = styled.sourceHandle
    let target = styled.target
    let targetHandle = styled.targetHandle
    if (sourceNode?.hidden && sourceNode.parentId && map[sourceNode.parentId]?.type === 'frame') {
      source = sourceNode.parentId
      sourceHandle = 'frame-source'
    }
    if (targetNode?.hidden && targetNode.parentId && map[targetNode.parentId]?.type === 'frame') {
      target = targetNode.parentId
      targetHandle = 'frame-target'
    }
    if (source === target) continue
    result.push({ ...styled, source, sourceHandle, target, targetHandle })
  }
  return result
}


/**
 * MiniMap node coloring (see the <MiniMap> in the main render) — reuses the
 * exact same category palette as CATEGORY_STYLES/displayEdges above, so the
 * minimap's tiny dots read as "which kind of node lives where" at a glance,
 * matching the graph's own header tints instead of one more color to learn.
 */
export function minimapNodeColor(node: Node): string {
  if (node.type && PROCESS_TYPES.has(node.type)) return '#6366f1'
  if (node.type && CONTENT_TYPES_WITH_SCENE.has(node.type)) return '#10b981'
  if (node.type && STYLE_TYPES.has(node.type)) return '#f59e0b'
  if (node.type && DATA_TYPES.has(node.type)) return '#0ea5e9'
  return '#94a3b8'
}


/**
 * React Flow's own internal engine (@xyflow/system's updateChildNode) walks
 * `nodes` in array order and requires a `parentId` to already have been
 * processed — i.e. a parent must appear BEFORE its children in the array —
 * or it warns "Parent node not found" and leaves that child's absolute
 * position unresolved, which is what makes a node dropped onto a Frame (see
 * onNodeDragStop in SceneBuilderPage.tsx, the only place `parentId` gets
 * set) visibly jump to the wrong spot the instant the drop sets `parentId`:
 * the node was added to the array (or loaded from a save) before the Frame
 * it just got nested under. Restores that invariant by pulling each node's
 * ancestor chain in ahead of it wherever it's missing, otherwise leaving
 * relative order untouched — call this any time `parentId` changes (a
 * reparent) or nodes are loaded from a save that might predate this
 * ordering fix.
 */
export function sortNodesForParenting(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ordered: Node[] = []
  const placed = new Set<string>()

  const place = (node: Node): void => {
    if (placed.has(node.id)) return
    if (node.parentId) {
      const parent = byId.get(node.parentId)
      if (parent) place(parent)
    }
    placed.add(node.id)
    ordered.push(node)
  }

  nodes.forEach(place)
  return ordered
}

/**
 * Fixed background z-index for every Layout Frame node (see addNode in
 * hooks/useSceneGraph.ts) — negative enough that even React Flow's own
 * "bump a selected node above everything" boost (+1000 while selected, see
 * @xyflow/system's calculateZ) can never push a Frame above an unselected
 * sibling's baseline z of 0. Without this, clicking a Frame to move or
 * resize it (which selects it) briefly put it — and its own opaque header —
 * ON TOP of the very children it's supposed to sit behind, for as long as
 * it stayed selected.
 */
export const FRAME_Z_INDEX = -10000

/**
 * Re-applies FRAME_Z_INDEX to every Frame node — a node's own `zIndex`
 * comes from addNode at creation time, so this only matters for nodes
 * loaded from a save made before FRAME_Z_INDEX existed (or edited by hand).
 * Leaves every other node's zIndex untouched.
 */
export function withFrameZIndex(nodes: Node[]): Node[] {
  return nodes.map((n) => (n.type === 'frame' && n.zIndex !== FRAME_Z_INDEX ? { ...n, zIndex: FRAME_Z_INDEX } : n))
}

/** Fallback size (px) for a node dagre hasn't measured yet — see layoutGraph. Close to BaseNode's own real footprint (min-w-[150px] plus a couple of socket rows) so the very first Prettify pass on a freshly-loaded graph is still reasonable before nodes settle to their true rendered size. */
export const LAYOUT_DEFAULT_SIZE = { width: 190, height: 110 }


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
 *
 * A node nested inside a Layout Frame (`parentId` set) is left exactly
 * where it is, Frame nodes themselves included: dagre only ever computes
 * ABSOLUTE layout-space coordinates, but a child's own `position` is
 * relative to its Frame, not the canvas — handing dagre's result straight
 * to a child would have React Flow reinterpret that absolute coordinate as
 * a relative offset from the Frame and fling it way outside it the instant
 * Prettify writes it back (the "pulls nodes out of the Layout Frame" bug).
 * Frame nodes have no edges of their own (Frame isn't in NODE_SOCKETS) for
 * dagre to rank them by either, so there's nothing useful for it to decide
 * about their position anyway — whatever's nested inside rides along
 * automatically once the Frame itself stays put.
 */
export function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 140, marginx: 40, marginy: 40 })
  g.setDefaultEdgeLabel(() => ({}))

  const sizeOf = (node: Node): { width: number; height: number } => ({
    width: node.measured?.width ?? LAYOUT_DEFAULT_SIZE.width,
    height: node.measured?.height ?? LAYOUT_DEFAULT_SIZE.height
  })

  const layoutable = nodes.filter((n) => !n.parentId && n.type !== 'frame')
  const layoutableIds = new Set(layoutable.map((n) => n.id))

  for (const node of layoutable) {
    g.setNode(node.id, sizeOf(node))
  }
  for (const edge of edges) {
    if (!layoutableIds.has(edge.source) || !layoutableIds.has(edge.target)) continue
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
export interface ScheduledTask {
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
export function buildProcessSchedule(nodes: Node[], edges: Edge[]): { schedule: ScheduledTask[]; totalMs: number } | null {
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
      const target = incomingNodes.find((n) => n.type === 'text' || n.type === 'image' || n.type === 'video' || n.type === 'box' || n.type === 'group')
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
 * The real on-screen center (viewport pixels, like getBoundingClientRect
 * itself) of one specific Handle — `data-nodeid`/`data-handleid` are
 * attributes React Flow's own Handle component puts on every rendered
 * handle precisely so code outside the library can look one up exactly
 * like this. Used instead of approximating a position from the node's own
 * position/measured size (an earlier version of this file did) because
 * that couldn't account for WHERE within a node's own socket list a
 * specific labeled row like "event-in" actually sits — a Task's sequence
 * input, for instance, is several rows below its own vertical center, with
 * other sockets (Target/Transform/Style/Sound) stacked above it. Querying
 * the real DOM element is the only way to land exactly where React Flow
 * itself draws the connecting edge from/to, and it stays correct through
 * pan/zoom for free since getBoundingClientRect always reflects whatever
 * transform is currently applied — no separate flow-to-screen conversion
 * needed. `null` if the handle isn't in the DOM (shouldn't normally happen —
 * every process node's Handles are always rendered here, never
 * virtualized).
 */
export function handleScreenCenter(nodeId: string, handleId: string): { x: number; y: number } | null {
  const el = document.querySelector(`.react-flow__handle[data-nodeid="${nodeId}"][data-handleid="${handleId}"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}


/**
 * The linear Start → Task → Wait → ... → End chain as a list of
 * checkpoints, `atMs` being the process's own clock value (see
 * buildProcessSchedule, whose exact accumulation this mirrors) at the
 * moment the token reaches each one — used by processTokenPosition to
 * interpolate between whichever two checkpoints bracket the current
 * clockMs. Every Wait node's delay is spent traveling the EDGE leading INTO
 * it (so the token visibly slides toward a Wait for its own delay, arriving
 * exactly as it elapses) rather than pausing once there — Start/Task/End
 * checkpoints themselves take no time to pass through, matching how
 * buildProcessSchedule only ever advances `atMs` on a Wait. Returns an
 * empty list when there's no Start node.
 */
export function processChainNodes(nodes: Node[], edges: Edge[]): { node: Node; atMs: number }[] {
  const map = buildNodeMap(nodes)
  const start = nodes.find((n) => n.type === 'start')
  if (!start) return []
  const chain: { node: Node; atMs: number }[] = [{ node: start, atMs: 0 }]
  let atMs = 0
  let current = nextProcessNode(start.id, edges, map)
  while (current) {
    if (current.type === 'wait') atMs += (current.data.delay as number) || 1000
    chain.push({ node: current, atMs })
    if (current.type === 'end') break
    current = nextProcessNode(current.id, edges, map)
  }
  return chain
}


/**
 * One detached (never appended to the document) SVGPathElement, reused on
 * every call — geometry queries like getTotalLength/getPointAtLength only
 * need the element's own `d` attribute, not layout or a parent document, so
 * there's no need to mount it anywhere. Module-level singleton purely to
 * avoid allocating a fresh DOM node on every animation frame while
 * ProcessToken is visible.
 */
export let bezierMeasurePath: SVGPathElement | null = null


/**
 * A point on the SAME bezier curve React Flow's own default edge would draw
 * between `(sourceX, sourceY)` (Position.Right) and `(targetX, targetY)`
 * (Position.Left), at arc-length fraction `t` (0 = source, 1 = target) —
 * this is what makes ProcessToken visibly ride the actual rendered
 * connection line instead of cutting a straight line through it whenever
 * two chained nodes sit at different heights (the common case after a
 * dagre auto-layout). getBezierPath is the exact function React Flow's
 * BezierEdge itself calls (see createBezierEdge in @xyflow/react) with no
 * `curvature` override here either, matching its own default. Coordinate
 * space doesn't matter — the curve's shape only depends on the two
 * endpoints, and scaling/translating them (exactly what pan/zoom does)
 * scales/translates the resulting curve the same way — so processTokenPosition
 * feeds this real on-screen pixel coordinates (see handleScreenCenter)
 * straight through with no separate flow-to-screen conversion step, and the
 * path string still matches byte-for-byte what's already on screen at the
 * current zoom.
 */
export function pointOnBezier(sourceX: number, sourceY: number, targetX: number, targetY: number, t: number): { x: number; y: number } {
  if (!bezierMeasurePath) bezierMeasurePath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  const [d] = getBezierPath({ sourceX, sourceY, sourcePosition: Position.Right, targetX, targetY, targetPosition: Position.Left })
  bezierMeasurePath.setAttribute('d', d)
  const length = bezierMeasurePath.getTotalLength()
  const point = bezierMeasurePath.getPointAtLength(length * Math.min(1, Math.max(0, t)))
  return { x: point.x, y: point.y }
}


/**
 * Minimum visual travel time (ms) ProcessToken spends crossing any ONE
 * segment of the chain — even one whose REAL atMs delta is 0, which is the
 * common case: only a Wait node ever advances atMs (see
 * buildProcessSchedule), so a process with several Tasks in a row and no
 * Wait between them would otherwise have the token teleport straight past
 * all of them the instant clockMs reaches that shared atMs, never visibly
 * "passing through" most of the chain. Purely cosmetic — see
 * processTokenChain, the only place this is used; the REAL event-timeline
 * computeTaskState/buildProcessSchedule use to decide when a Task actually
 * shows/hides is completely untouched by any of this.
 */
export const PROCESS_TOKEN_MIN_SEGMENT_MS = 400


/**
 * `chain` (see processChainNodes) remapped onto a "virtual" clock where
 * every segment gets AT LEAST PROCESS_TOKEN_MIN_SEGMENT_MS of travel time,
 * so ProcessToken visibly glides across every hop from Start to End instead
 * of skipping however many have zero real duration. A segment that already
 * takes real time (a Wait's own delay, when it's at least the minimum)
 * keeps that duration, so a long Wait still reads as proportionally slower
 * than a short one or an instant hop.
 */
export function processTokenChain(nodes: Node[], edges: Edge[]): { node: Node; vAtMs: number }[] {
  const chain = processChainNodes(nodes, edges)
  if (chain.length === 0) return []
  const virtual: { node: Node; vAtMs: number }[] = [{ node: chain[0].node, vAtMs: 0 }]
  for (let i = 1; i < chain.length; i++) {
    const realSpan = chain[i].atMs - chain[i - 1].atMs
    virtual.push({ node: chain[i].node, vAtMs: virtual[i - 1].vAtMs + Math.max(realSpan, PROCESS_TOKEN_MIN_SEGMENT_MS) })
  }
  return virtual
}


/**
 * Where ProcessToken currently sits, in real screen pixels (see
 * handleScreenCenter) — `clockMs` (the real elapsed preview time,
 * 0..`durationMs`) is first rescaled onto processTokenChain's own virtual
 * timeline (proportionally, so the token still finishes crossing the WHOLE
 * chain exactly as the real preview run ends) before interpolating between
 * whichever two checkpoints bracket it. `null` when there's no Start node,
 * or (transiently) if a handle isn't in the DOM yet.
 */
export function processTokenPosition(nodes: Node[], edges: Edge[], clockMs: number, durationMs: number): { x: number; y: number } | null {
  const chain = processTokenChain(nodes, edges)
  if (chain.length === 0) return null
  if (chain.length === 1) return handleScreenCenter(chain[0].node.id, 'output')
  const virtualTotal = chain[chain.length - 1].vAtMs
  const vClockMs = durationMs > 0 ? (Math.min(clockMs, durationMs) / durationMs) * virtualTotal : virtualTotal
  let i = chain.findIndex((c) => c.vAtMs >= vClockMs)
  if (i === -1) i = chain.length - 1 // past the final checkpoint — clamp to the last segment
  if (i === 0) return handleScreenCenter(chain[0].node.id, 'output')
  const from = chain[i - 1]
  const to = chain[i]
  const span = to.vAtMs - from.vAtMs
  const t = span > 0 ? (vClockMs - from.vAtMs) / span : 1
  const a = handleScreenCenter(from.node.id, 'output')
  const b = handleScreenCenter(to.node.id, 'event-in')
  if (!a || !b) return null
  return pointOnBezier(a.x, a.y, b.x, b.y, t)
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
export function processExitBufferMs(schedule: ScheduledTask[], totalMs: number): number {
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
export function processTrigger(nodes: Node[], edges: Edge[]): { active: boolean; alertTypes: string[]; audioArmed: boolean } {
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
export interface TaskState {
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
export function computeTaskState(schedule: ScheduledTask[], targetId: string, atMs: number, baseMods?: Node[]): TaskState {
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


/** Ordering modifier node wired into a target (Box or Scene), expressed as a tailwind flex-direction class. */
export function orderingClass(mods: Node[]): string {
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
export function orderingGap(mods: Node[]): number {
  const ordering = mods.find((m) => m.type === 'ordering')
  return (ordering?.data.gap as number) ?? 8
}


/** Which axis is the CROSS axis for a Box/Scene's children, from the same Ordering modifier orderingClass reads — 'vertical' for a horizontal/row layout, 'horizontal' for the default vertical/column one. Mirrors crossAxisFor in overlays/custom.html; see TextView's own doc comment for what this is used for. */
export function crossAxisFor(mods: Node[]): 'horizontal' | 'vertical' {
  const ordering = mods.find((m) => m.type === 'ordering')
  const layout = (ordering?.data.layout as string) || 'vertical'
  return layout === 'horizontal' ? 'vertical' : 'horizontal'
}


/** A Box's corner treatment (see BOX_SHAPE_IDS' own doc comment in components/nodes/index.tsx) as borderRadius/clipPath — mirrors boxShapeStyle in overlays/custom.html. */
export function boxShapeStyle(node: Node): { borderRadius: string; clipPath?: string } {
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
export const MAX_BOX_DEPTH = 12


/**
 * The Background FX node feeding a scene, if any — mirrors
 * showProcessContent/applyBackgroundFx in overlays/custom.html. For a
 * Process (a Start node exists), Background FX is wired into Start (the
 * trigger point) rather than Scene, same convention as Event/Sound;
 * otherwise connected to Scene when one exists, or a flat scan (pre-
 * Scene-node saves) like ScenePreview's own fallback branch.
 */
export function findBackgroundFx(nodes: Node[], edges: Edge[]): Node | undefined {
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
export function findBackgroundFxLabel(
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
