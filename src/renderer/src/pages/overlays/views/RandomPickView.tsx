import { useMemo } from "react";
import { Node, Edge } from "@xyflow/react";
import type { OverlayUrls } from "@shared/types";
import { pickRandomVariant, MAX_BOX_DEPTH, NodeMap, ScheduledTask } from "../sceneUtils";
import { ContentView } from "./ContentView";

/**
 * Resolves to exactly ONE of its wired `children` (see pickRandomVariant) —
 * carries no Transform/Style/visual identity of its own (see
 * RANDOM_PICK_SOCKETS' own doc comment in components/nodes/constants.ts),
 * so once picked this just delegates straight back into ContentView for
 * THAT node, which keeps its own normal wiring (Transform/Style/nested
 * Task target) exactly as if it had been wired in directly — same "thin
 * router" shape as a Condition node routing sequence-flow, just for the
 * content/composition graph instead.
 *
 * Picked once per "show", not on every re-render: `useMemo` keyed on
 * `playToken` (the SAME remount signal every entrance animation already
 * restarts on — see BoxView's own `key={child.id}-${playToken}`) rather
 * than on `edges`/`map` (which change reference on nearly every unrelated
 * edit anywhere in the graph). Calling pickRandomVariant on every render
 * instead would make the choice visibly flicker while, say, just typing
 * into a completely unrelated Text node — this still rerolls every time
 * the scene (or the Process step targeting a container this is nested in)
 * actually replays, same as an entrance animation would.
 */
export function RandomPickView({
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
  schedule: ScheduledTask[]
  clockMs: number
  urls: OverlayUrls | null
  depth?: number
  crossAxis: 'horizontal' | 'vertical'
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately NOT keyed on edges/map/node, whose identity changes on nearly every unrelated graph edit; see this component's own doc comment for why only playToken (plus node.id, in case two Random Pick nodes ever shared a key) should trigger a fresh pick.
  const picked = useMemo(() => (depth >= MAX_BOX_DEPTH ? null : pickRandomVariant(node, edges, map)), [node.id, playToken])
  if (!picked) {
    return depth >= MAX_BOX_DEPTH ? null : (
      // Editor-only affordance, same convention as BoxView's own "Empty
      // shape" placeholder — without this, an unwired Random Pick just
      // silently renders nothing, which reads as broken rather than empty.
      <span className="text-white/30 italic whitespace-nowrap" style={{ fontSize: 20 }}>
        Empty Random Pick — wire Text, Image, Video, Shape, Group or another Random Pick into it
      </span>
    )
  }
  return (
    <ContentView
      node={picked}
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
      crossAxis={crossAxis}
    />
  )
}
