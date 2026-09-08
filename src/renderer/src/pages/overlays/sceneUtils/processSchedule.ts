import { Node, Edge, getBezierPath, Position } from "@xyflow/react";
import { buildNodeMap, incoming, nextProcessNode, evaluateCondition } from "./graph";
import { Anim, animationAttrs, animationFallbackMs } from "./animation";
import { modifierStyle } from "./style";

/** One Task, resolved to when it fires and what it affects — see buildProcessSchedule. */
export interface ScheduledTask {
  atMs: number
  targetId: string
  action: string
  mods: Node[]
}


/**
 * Safety cap on how many nodes buildProcessSchedule/processChainNodes will
 * ever walk in one pass — Condition (see CONDITION_OUTPUTS) makes it
 * possible to wire Else (or Then) back to an EARLIER step, an intentional
 * "retry"-style loop; without a cap, one that never reaches End (or a
 * genuine accidental cycle) would hang the walk and, in buildProcessSchedule,
 * grow `schedule`/`atMs` without bound. Generous enough that no legitimate
 * process — looped or not — should ever come close; mirrors
 * MAX_PROCESS_STEPS in overlays/custom.html.
 */
export const MAX_PROCESS_STEPS = 500

/**
 * Walks the Start → Task → Wait → Condition → ... → End sequence-flow chain
 * into a flat, time-resolved schedule: one entry per Task, `atMs`
 * accumulated from every Wait node's delay passed so far. A Task with no
 * component wired into it (via a plain data edge, same convention Box
 * already uses for its own children) is skipped. A Condition (see
 * nextProcessNode) picks Then or Else by evaluating its field/operator/
 * value against `vars` — the SAME bag a Text/Image placeholder already
 * reads (null outside a real alert-armed process, in which case every
 * Condition falls to Else). Returns null when there's no Start node at all
 * — see processTrigger, the caller that decides whether this applies.
 * Mirrors buildProcessSchedule in overlays/custom.html.
 */
export function buildProcessSchedule(nodes: Node[], edges: Edge[], vars: Record<string, unknown> | null = null): { schedule: ScheduledTask[]; totalMs: number } | null {
  const map = buildNodeMap(nodes)
  const start = nodes.find((n) => n.type === 'start')
  if (!start) return null
  const schedule: ScheduledTask[] = []
  let atMs = 0
  let current = nextProcessNode(start.id, edges, map, vars)
  let steps = 0
  while (current && steps++ < MAX_PROCESS_STEPS) {
    if (current.type === 'wait') {
      atMs += (current.data.delay as number) || 1000
    } else if (current.type === 'task') {
      const incomingNodes = incoming(current.id, edges, map)
      const target = incomingNodes.find((n) => n.type === 'text' || n.type === 'image' || n.type === 'video' || n.type === 'progress' || n.type === 'box' || n.type === 'group')
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
    current = nextProcessNode(current.id, edges, map, vars)
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
 * The Start → Task → Wait → Condition → ... → End chain as a list of
 * checkpoints, `atMs` being the process's own clock value (see
 * buildProcessSchedule, whose exact accumulation this mirrors) at the
 * moment the token reaches each one — used by processTokenPosition to
 * interpolate between whichever two checkpoints bracket the current
 * clockMs. Every Wait node's delay is spent traveling the EDGE leading OUT
 * of it (so the token arrives at a Wait instantly and then slides away from
 * it for its own delay, only reaching the next node once it elapses) rather
 * than pausing before it — Start/Task/End checkpoints themselves take no
 * time to pass through, matching how buildProcessSchedule only ever
 * advances `atMs` on a Wait (a Task immediately after a Wait still lands on
 * the same post-delay atMs buildProcessSchedule gives it — only the Wait
 * node's own checkpoint here is pre-delay). `fromHandle`: the source-side
 * handle id of the PREVIOUS node's own outgoing edge that reached this
 * checkpoint — 'output' for the plain generic handle every non-Condition
 * process node has, or 'then'/'else' when the previous node was itself a
 * Condition (see CONDITION_OUTPUTS) — since a Condition has no 'output'
 * handle at all, processTokenPosition needs the REAL id to find the right
 * Handle element on screen (see handleScreenCenter). Branches are resolved
 * against `vars` exactly like buildProcessSchedule (null outside a real
 * alert-armed process — every Condition then falls to Else). Returns an
 * empty list when there's no Start node.
 */
export function processChainNodes(
  nodes: Node[],
  edges: Edge[],
  vars: Record<string, unknown> | null = null
): { node: Node; atMs: number; fromHandle: string }[] {
  const map = buildNodeMap(nodes)
  const start = nodes.find((n) => n.type === 'start')
  if (!start) return []
  const chain: { node: Node; atMs: number; fromHandle: string }[] = [{ node: start, atMs: 0, fromHandle: 'output' }]
  let atMs = 0
  let prevId = start.id
  let current = nextProcessNode(start.id, edges, map, vars)
  let steps = 0
  while (current && steps++ < MAX_PROCESS_STEPS) {
    const prevNode = map[prevId]
    const fromHandle = prevNode?.type === 'condition' ? (evaluateCondition(prevNode.data, vars) ? 'then' : 'else') : 'output'
    chain.push({ node: current, atMs, fromHandle })
    if (current.type === 'wait') atMs += (current.data.delay as number) || 1000
    if (current.type === 'end') break
    prevId = current.id
    current = nextProcessNode(current.id, edges, map, vars)
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
export function processTokenChain(nodes: Node[], edges: Edge[], vars: Record<string, unknown> | null = null): { node: Node; vAtMs: number; fromHandle: string }[] {
  const chain = processChainNodes(nodes, edges, vars)
  if (chain.length === 0) return []
  const virtual: { node: Node; vAtMs: number; fromHandle: string }[] = [{ node: chain[0].node, vAtMs: 0, fromHandle: chain[0].fromHandle }]
  for (let i = 1; i < chain.length; i++) {
    const realSpan = chain[i].atMs - chain[i - 1].atMs
    virtual.push({ node: chain[i].node, vAtMs: virtual[i - 1].vAtMs + Math.max(realSpan, PROCESS_TOKEN_MIN_SEGMENT_MS), fromHandle: chain[i].fromHandle })
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
export function processTokenPosition(
  nodes: Node[],
  edges: Edge[],
  clockMs: number,
  durationMs: number,
  vars: Record<string, unknown> | null = null
): { x: number; y: number } | null {
  const chain = processTokenChain(nodes, edges, vars)
  if (chain.length === 0) return null
  if (chain.length === 1) return handleScreenCenter(chain[0].node.id, chain[0].fromHandle)
  const virtualTotal = chain[chain.length - 1].vAtMs
  const vClockMs = durationMs > 0 ? (Math.min(clockMs, durationMs) / durationMs) * virtualTotal : virtualTotal
  let i = chain.findIndex((c) => c.vAtMs >= vClockMs)
  if (i === -1) i = chain.length - 1 // past the final checkpoint — clamp to the last segment
  if (i === 0) return handleScreenCenter(chain[0].node.id, chain[0].fromHandle)
  const from = chain[i - 1]
  const to = chain[i]
  const span = to.vAtMs - from.vAtMs
  const t = span > 0 ? (vClockMs - from.vAtMs) / span : 1
  // `to.fromHandle` is the handle on FROM's own node that this segment's
  // edge actually left from (see processChainNodes' own doc comment) — NOT
  // from.fromHandle, which instead describes how FROM itself was reached.
  const a = handleScreenCenter(from.node.id, to.fromHandle)
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
 *
 * Checks EVERY Task, not just ones exactly at totalMs: a Task earlier in
 * the chain (typically a `hide`) still needs its own atMs + duration to
 * fit before the run ends, same as a final-wave one — a short Wait right
 * after it doesn't guarantee that on its own (e.g. a 250ms Wait following
 * an 800ms exit animation used to let the scene tear down 550ms before
 * that Task's own Animation had actually finished, cutting it off mid-play
 * instead of hiding only once it's done).
 */
export function processExitBufferMs(schedule: ScheduledTask[], totalMs: number): number {
  let latestEndMs = totalMs
  for (const s of schedule) {
    const animAttrs = animationAttrs(s.mods)
    if (!animAttrs) continue
    const duration = animAttrs.duration || animationFallbackMs(animAttrs.type)
    const endMs = s.atMs + duration
    if (endMs > latestEndMs) latestEndMs = endMs
  }
  return latestEndMs - totalMs
}


/**
 * Whether Scene's process is armed — either by a DataSource(alert) wired
 * into its Start node (`alertTypes`, matched against a real alert), by an
 * Audio Player wired into Start (`audioArmed` — a track-change trigger
 * instead of a type match), by a Roulette node wired into Start
 * (`rouletteArmed` — fires the moment a round starts collecting), or by a
 * Random node wired into Start (`randomArmed` — fires the moment a roll is
 * committed). All four are only meaningful in the real overlay since the
 * editor has no live now-playing/roulette/random feed to react to — see
 * processTrigger in overlays/custom.html. Any one alone makes `active` true.
 */
export function processTrigger(
  nodes: Node[],
  edges: Edge[]
): { active: boolean; alertTypes: string[]; audioArmed: boolean; rouletteArmed: boolean; randomArmed: boolean } {
  const start = nodes.find((n) => n.type === 'start')
  if (!start) return { active: false, alertTypes: [], audioArmed: false, rouletteArmed: false, randomArmed: false }
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
  const rouletteArmed = members.some((n) => n.type === 'rouletteSource')
  const randomArmed = members.some((n) => n.type === 'randomSource')
  return { active: alertTypes.length > 0 || audioArmed || rouletteArmed || randomArmed, alertTypes, audioArmed, rouletteArmed, randomArmed }
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
