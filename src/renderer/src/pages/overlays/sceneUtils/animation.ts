import { Node, Edge } from "@xyflow/react";
import { buildNodeMap, incoming, lastOfType } from "./graph";

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
      for (const child of mods.filter((m) => m.type === 'text' || m.type === 'image' || m.type === 'video' || m.type === 'progress' || m.type === 'box' || m.type === 'group')) {
        visit(child)
      }
    }
  }
  const renderable = incoming(scene.id, edges, map).filter((n) => n.type === 'box' || n.type === 'group' || n.type === 'text' || n.type === 'image' || n.type === 'video' || n.type === 'progress')
  for (const n of renderable) visit(n)
  return max || 250
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
 * in a Process (see computeTaskState in processSchedule.ts) — 'auto' or
 * unset there falls back to the Task's own show/hide action, same as before
 * this field existed; the plain single-trigger model ignores it entirely
 * (direction is already unambiguous from lifecycle: entrance on build, exit
 * on hide).
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
 * An Overflow modifier's `autoScroll` fields resolved into a render
 * directive, or null when off/absent — mirrors overflowAutoScroll in
 * overlays/custom.html. `axis`/`reverse` pick which keyframe
 * (ov-autoscroll-x/-y, defined identically in overlays/animations.css and
 * scene-preview-animations.css) and animation-direction to use.
 *
 * `speed` is px/second, NOT a fixed loop duration — the caller (AutoScrollTrack
 * here, applyAutoScrollContent in custom.html) measures its own rendered
 * copy's actual size and divides by this to get the CSS animation-duration.
 * A fixed duration-per-loop was tried first and looked "jerky"/incomplete
 * for a long entrants list: the same 20s that reads fine for 5 rows blows
 * through 40 rows so fast they're unreadable, which feels like it's cutting
 * content off rather than genuinely showing every row. Pinning px/second
 * instead keeps the READING pace constant regardless of how many rows there
 * are — a longer list just takes proportionally longer per loop, exactly
 * matching what "slow scroll" should mean here. Unlike modifierStyle, this
 * doesn't fall back to a Task's own baseMods parameter — a Task never wires
 * its own Overflow (TASK_SOCKETS' style socket doesn't accept it, same as
 * Hide), so the target's own base wiring is always what `mods` already is
 * regardless of whether a Process is driving it.
 */
export type OverflowAutoScroll = { axis: 'x' | 'y'; speed: number; reverse: boolean } | null

export function overflowAutoScroll(mods: Node[]): OverflowAutoScroll {
  const overflow = lastOfType(mods, 'overflow')
  if (!overflow || !overflow.data.autoScroll) return null
  const direction = (overflow.data.scrollDirection as string) || 'up'
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y'
  const reverse = direction === 'down' || direction === 'right'
  const speed = Math.max(5, (overflow.data.scrollSpeed as number) ?? 40)
  return { axis, speed, reverse }
}
