import { Node } from "@xyflow/react";
import { Music, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { customImageUrl } from "@/lib/custom-image-url";
import type { OverlayUrls } from "@shared/types";
import { borderBoxStyle, Anim } from "../sceneUtils";

export function ImageView({
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
  const fit = (node.data.fit as string) || 'cover'
  const src = audioCover ? undefined : (customImageUrl(urls, customImageName) ?? (node.data.src as string | undefined))
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
          // No own Width/Height field (see ImageNode's own doc comment in
          // components/nodes/index.tsx) — 96x96 here is only the fallback;
          // `...style` (a wired Size node's width/height, from
          // modifierStyle) overrides it since it spreads AFTER these.
          width: 96,
          height: 96,
          ...style,
          borderRadius: `${(node.data.borderRadius as number) ?? 8}px`,
          ...borderBoxStyle(node, 'rgba(255, 255, 255, 0.08)'),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
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
  )
}
