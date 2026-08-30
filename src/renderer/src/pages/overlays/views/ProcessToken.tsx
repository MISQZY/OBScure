import { createPortal } from "react-dom";
import { Node, Edge } from "@xyflow/react";
import { processTokenPosition } from "../sceneUtils";

/**
 * Small circle that slides along the process's own Sequence-flow edges
 * during Play/Test, showing at a glance where the running
 * Start→Task→Wait→...→End chain currently is — purely a visual aid, no
 * effect on rendering or on ScenePreview's own separately-computed Task
 * states. Rendered as a `position: fixed` div portaled straight to
 * `document.body` (same pattern NodePopover in components/nodes/index.tsx
 * uses for its own dropdown, and for the same reason: guaranteed not to be
 * clipped or mispositioned by anything in React Flow's own DOM structure)
 * at real screen coordinates from processTokenPosition/handleScreenCenter —
 * NOT a React Flow node, which would mean writing a position into `nodes`
 * state every animation frame, and NOT flow-space coordinates converted via
 * the current pan/zoom, since measuring the real Handle elements already
 * accounts for whatever transform is currently applied. `durationMs` is the
 * full real preview run length (totalMs + the exit buffer — see
 * processExitBufferMs) clockMs is counted against, for processTokenPosition
 * to rescale onto its own virtual timeline.
 */
export function ProcessToken({
  nodes,
  edges,
  clockMs,
  durationMs,
  active
}: {
  nodes: Node[]
  edges: Edge[]
  clockMs: number
  durationMs: number
  active: boolean
}) {
  if (!active) return null
  const point = processTokenPosition(nodes, edges, clockMs, durationMs)
  if (!point) return null
  return createPortal(
    <div
      className="pointer-events-none fixed left-0 top-0 z-[9999] size-3 rounded-full bg-indigo-400 ring-2 ring-indigo-200 shadow-[0_0_8px_2px_rgba(99,102,241,0.7)]"
      style={{ transform: `translate(${point.x - 6}px, ${point.y - 6}px)` }}
    />,
    document.body
  )
}
