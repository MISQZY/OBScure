import { Node, Edge } from "@xyflow/react";
import { Video as VideoIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OverlayUrls } from "@shared/types";
import { borderBoxStyle, radiusCss, Anim, incoming, orderingClass, orderingGap, crossAxisFor, MAX_BOX_DEPTH, NodeMap, ScheduledTask } from "../sceneUtils";
import { ContentView } from "./ContentView";

/** Node types a Video's own `children` socket accepts — mirrors VIDEO_SOCKETS' `children` in components/nodes/constants.ts. */
const CHILD_TYPES = new Set(['text', 'image', 'video', 'progress', 'box', 'group', 'randomPick', 'rouletteWidget', 'randomWidget'])

/** Mirrors ImageView — see buildVideo in overlays/custom.html. Autoplays muted/looping in the editor preview too, same defaults as the real overlay. */
export function VideoView({
  node,
  style,
  anim,
  played,
  hiding,
  urls,
  edges,
  map,
  playToken,
  vars,
  schedule,
  clockMs,
  depth = 0
}: {
  node: Node
  style: React.CSSProperties
  anim: Anim
  played: boolean
  hiding: boolean
  /** Not read by this node's own <video> — only forwarded to a wired-in Image child, which needs it to resolve an uploaded custom-images file. */
  urls: OverlayUrls | null
  /** Needed, alongside `map`, to resolve this node's own `children` wire — see VIDEO_SOCKETS' own doc comment in components/nodes/constants.ts for why a Video can be a container too, same as Box. */
  edges: Edge[]
  map: NodeMap
  playToken: number
  vars: Record<string, unknown> | null
  schedule: ScheduledTask[]
  clockMs: number
  /** Nesting depth so far — see BoxView's own doc comment for why this is capped by MAX_BOX_DEPTH. */
  depth?: number
}) {
  const src = node.data.src as string | undefined
  const muted = node.data.muted !== false
  const loop = node.data.loop !== false
  const incomingNodes = incoming(node.id, edges, map)
  const children = depth >= MAX_BOX_DEPTH ? [] : incomingNodes.filter((n) => n.type != null && CHILD_TYPES.has(n.type))
  const childCrossAxis = crossAxisFor(incomingNodes)
  return (
    <div
      className={cn('relative overflow-hidden shrink-0', anim && played && 'visible', anim && hiding && 'hiding')}
      data-animation={anim?.type}
      style={
        {
          // No own Width/Height field, same reasoning as ImageView above.
          width: 320,
          height: 180,
          ...style,
          borderRadius: radiusCss(node.data, 8),
          ...borderBoxStyle(node, 'rgba(255, 255, 255, 0.08)'),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      <div className="absolute inset-0 flex items-center justify-center">
        {src ? (
          <video src={src} autoPlay muted={muted} loop={loop} playsInline className="w-full h-full object-cover" />
        ) : (
          <VideoIcon className="text-white/40 size-6" />
        )}
      </div>
      {/* The Video's own `children` — see ImageView's own doc comment, same
          overlay-on-top-of-the-media pattern. */}
      {children.length > 0 && (
        <div className={cn('absolute inset-0 flex items-center justify-center', orderingClass(incomingNodes))} style={{ gap: `${orderingGap(incomingNodes)}px` }}>
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
      )}
    </div>
  )
}
