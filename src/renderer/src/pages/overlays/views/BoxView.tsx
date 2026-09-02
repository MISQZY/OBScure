import { Node, Edge } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { OverlayUrls } from "@shared/types";
import {
  incoming,
  orderingClass,
  orderingGap,
  crossAxisFor,
  computeTaskState,
  modifierStyle,
  animationAttrs,
  borderBoxStyle,
  boxShapeStyle,
  MAX_BOX_DEPTH,
  NodeMap,
  ScheduledTask
} from "../sceneUtils";
import { ContentView } from "./ContentView";

export function BoxView({
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
  const isBox = node.type === 'box'
  const incomingNodes = incoming(node.id, edges, map)
  const children =
    depth >= MAX_BOX_DEPTH
      ? []
      : incomingNodes.filter(
          (n) =>
            n.type === 'text' ||
            n.type === 'image' ||
            n.type === 'video' ||
            n.type === 'box' ||
            n.type === 'group' ||
            n.type === 'randomPick' ||
            n.type === 'rouletteWidget' ||
            n.type === 'randomWidget'
        )
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
          // Group (see GroupNode's own doc comment) skips all of these —
          // it's an invisible wrapper, not a card.
          ...(isBox
            ? {
                padding: `${(node.data.paddingY as number) ?? 12}px ${(node.data.paddingX as number) ?? 16}px`,
                ...borderBoxStyle(node, (node.data.background as string) || '#18181b'),
                ...boxShapeStyle(node)
              }
            : {}),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {children.length === 0 && (
        // Editor-only affordance: without this, an unwired Box/Group
        // collapses to just its own padding (a near-invisible dot once the
        // canvas is scaled down for the preview panel) — see
        // BackgroundFxLayer's own preview-vs-real-overlay distinction for
        // the same pattern. Sized in the same ~canvas-px range as real Text
        // content (see TextView) so it survives the same scale-down instead
        // of vanishing at 10px.
        <span className="text-white/30 italic whitespace-nowrap" style={{ fontSize: 20 }}>
          {isBox ? 'Empty shape' : 'Empty group'} — wire a Text, Image, Video, Shape or Group into it
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
