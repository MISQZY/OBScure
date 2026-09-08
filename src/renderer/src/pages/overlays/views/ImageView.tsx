import { Node, Edge } from "@xyflow/react";
import { Music, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { customImageUrl } from "@/lib/custom-image-url";
import type { OverlayUrls } from "@shared/types";
import { borderBoxStyle, radiusCss, Anim, incoming, orderingClass, orderingGap, crossAxisFor, MAX_BOX_DEPTH, NodeMap, ScheduledTask } from "../sceneUtils";
import { ContentView } from "./ContentView";

/** Node types an Image's own `children` socket accepts — mirrors IMAGE_SOCKETS' `children` in components/nodes/constants.ts. */
const CHILD_TYPES = new Set(['text', 'image', 'video', 'progress', 'box', 'group', 'randomPick', 'rouletteWidget', 'randomWidget'])

export function ImageView({
  node,
  style,
  anim,
  played,
  hiding,
  urls,
  audioCover,
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
  /** Needed to build an absolute URL for an uploaded custom-images file (node.data.customImageName, takes priority over data.src — see ImageNode's own doc comment) — null before getOverlayUrls() resolves, in which case the node just shows its placeholder icon a beat longer. */
  urls: OverlayUrls | null
  /** Whether this node's `imageContent` socket is wired to Audio Player's Content output — see hasAudioCover. Forces the sample album-art placeholder, same priority buildImage in overlays/custom.html gives the live feed over a set URL/uploaded image. */
  audioCover: boolean
  /** Needed, alongside `map`, to resolve this node's own `children` wire — see IMAGE_SOCKETS' own doc comment in components/nodes/constants.ts for why an Image can be a container too, same as Box. */
  edges: Edge[]
  map: NodeMap
  playToken: number
  vars: Record<string, unknown> | null
  schedule: ScheduledTask[]
  clockMs: number
  /** Nesting depth so far — see BoxView's own doc comment for why this is capped by MAX_BOX_DEPTH. */
  depth?: number
}) {
  const customImageName = node.data.customImageName as string | undefined
  const fit = (node.data.fit as string) || 'cover'
  const src = audioCover ? undefined : (customImageUrl(urls, customImageName) ?? (node.data.src as string | undefined))
  const incomingNodes = incoming(node.id, edges, map)
  const children = depth >= MAX_BOX_DEPTH ? [] : incomingNodes.filter((n) => n.type != null && CHILD_TYPES.has(n.type))
  const childCrossAxis = crossAxisFor(incomingNodes)
  return (
    <div
      className={cn(
        'relative overflow-hidden shrink-0',
        anim && played && 'visible',
        anim && hiding && 'hiding'
      )}
      data-animation={anim?.type}
      style={
        {
          // No own Width/Height field (see ImageNode's own doc comment in
          // components/nodes/index.tsx) — 96x96 here is only the fallback;
          // `...style` (a wired Size node's width/height, from
          // modifierStyle) overrides it since it spreads AFTER these.
          width: 96,
          height: 96,
          ...style,
          borderRadius: radiusCss(node.data, 8),
          ...borderBoxStyle(node, 'rgba(255, 255, 255, 0.08)'),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      <div className="absolute inset-0 flex items-center justify-center">
        {src ? (
          // 'repeat' has no object-fit equivalent (no tiling keyword), so it's
          // rendered as a tiled CSS background instead of an <img> — mirrors
          // buildImage in overlays/custom.html.
          fit === 'repeat' ? (
            // Quoted + escaped: an unquoted url(...) terminates at the first
            // literal ')' — an URL containing one (or a space) would otherwise
            // silently truncate mid-string into an invalid background-image.
            <div className="w-full h-full" style={{ backgroundImage: `url("${src.replace(/["\\]/g, '\\$&')}")`, backgroundRepeat: 'repeat' }} />
          ) : (
            <img src={src} className="w-full h-full" style={{ objectFit: fit as React.CSSProperties['objectFit'] }} />
          )
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
      {/* The Image's own `children` — laid out on TOP of the media above (same
          Ordering-driven flex/gap Box's own children use), rather than inside
          the flow the way a plain content node would sit. Absent entirely
          when nothing's wired in, so an Image with no children renders
          pixel-identical to before this existed. */}
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
