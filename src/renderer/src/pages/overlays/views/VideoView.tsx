import { Node } from "@xyflow/react";
import { Video as VideoIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { borderStyle, Anim } from "../sceneUtils";

/** Mirrors ImageView — see buildVideo in overlays/custom.html. Autoplays muted/looping in the editor preview too, same defaults as the real overlay. */
export function VideoView({ node, style, anim, played, hiding }: { node: Node; style: React.CSSProperties; anim: Anim; played: boolean; hiding: boolean }) {
  const src = node.data.src as string | undefined
  const muted = node.data.muted !== false
  const loop = node.data.loop !== false
  return (
    <div
      className={cn('flex items-center justify-center overflow-hidden shrink-0', anim && played && 'visible', anim && hiding && 'hiding')}
      data-animation={anim?.type}
      style={
        {
          background: 'rgba(255, 255, 255, 0.08)',
          // No own Width/Height field, same reasoning as ImageView above.
          width: 320,
          height: 180,
          ...style,
          borderRadius: `${(node.data.borderRadius as number) ?? 8}px`,
          border: borderStyle(node),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {src ? (
        <video src={src} autoPlay muted={muted} loop={loop} playsInline className="w-full h-full object-cover" />
      ) : (
        <VideoIcon className="text-white/40 size-6" />
      )}
    </div>
  )
}
