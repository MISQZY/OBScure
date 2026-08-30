import { Node, Edge, MarkerType } from "@xyflow/react";
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


export const CONTENT_TYPES = new Set(['text', 'image', 'video', 'box', 'group', 'rouletteWidget', 'randomWidget'])

/** Box and Group — the two node types that can nest one another via their shared `children` socket (see BOX_SOCKETS' own doc comment in components/nodes/index.tsx), and so are the only ones isValidConnection's cycle guard needs to walk. */
export const CONTAINER_TYPES = new Set(['box', 'group'])

/** Same as CONTENT_TYPES plus 'scene' — used for the MiniMap's node coloring below, where Scene (never an edge SOURCE, so absent from CONTENT_TYPES) still needs to read as "content" like Text/Image/Box. */
export const CONTENT_TYPES_WITH_SCENE = new Set([...CONTENT_TYPES, 'scene'])

/** Position/Size/Transform/Animation/Hide/Display/Ordering — see NodeCategory's 'style' bucket in components/nodes/index.tsx. */
export const STYLE_TYPES = new Set(['position', 'size', 'transform', 'opacity', 'shadow', 'animation', 'hide', 'overflow', 'ordering'])

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


/**
 * Nesting can go as deep as the graph wants (see BOX_SOCKETS' own doc
 * comment in components/nodes/index.tsx) — this cap is only a safety net
 * against a cycle slipping past isValidConnection's own guard (imported/
 * hand-edited JSON, say) turning into infinite recursion that crashes this
 * React tree; no legitimate scene should ever come close to it. Mirrors
 * MAX_BOX_DEPTH in overlays/custom.html.
 */
export const MAX_BOX_DEPTH = 12
