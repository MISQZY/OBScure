import { Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { RouletteWheel } from "../../tools/RouletteWheel";
import { SAMPLE_ROULETTE_STATE, Anim } from "../sceneUtils";

/**
 * What a Roulette Widget node itself renders (see NODE_SOCKETS.
 * rouletteWidget/ROULETTE_WIDGET_OUTPUTS in components/nodes/constants.ts)
 * — reuses the real RouletteWheel component (pages/tools/RouletteWheel.tsx)
 * the standalone Roulette tool page itself renders, fed the fixed
 * SAMPLE_ROULETTE_STATE (the editor has no live round to preview — see
 * SAMPLE_ROULETTE_STATE's own doc comment). Always shown, regardless of
 * whether this widget's own `visible` socket is wired — the editor preview
 * doesn't simulate the round ever going idle (see the widget's own doc
 * comment in RouletteWidgetNode.tsx for what that socket does for real).
 * Static: `animate`/`tracking` are both false, since there's no real spin to
 * animate toward in the editor. Mirrors buildRouletteWheel in
 * overlays/custom.html, which instead reads the REAL live round, honors the
 * `visible` socket, and does animate its spin.
 */
export function RouletteWheelView({ node, style, anim, played, hiding }: { node: Node; style: React.CSSProperties; anim: Anim; played: boolean; hiding: boolean }) {
  // No own Width/Height field, same reasoning as ImageView/VideoView above —
  // a wired Size node's width (falling back to height, then the default)
  // picks the wheel's rendered size; it's always square regardless of which
  // axis a Size modifier actually set.
  const size = typeof style.width === 'number' ? style.width : typeof style.height === 'number' ? style.height : 240
  return (
    <div
      className={cn('flex items-center justify-center shrink-0', anim && played && 'visible', anim && hiding && 'hiding')}
      data-animation={anim?.type}
      style={{ ...style, width: size, height: size, ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {}) } as React.CSSProperties}
    >
      <RouletteWheel entrants={SAMPLE_ROULETTE_STATE.entrants} rotation={0} winnerId={null} animate={false} tracking={false} size={size} />
    </div>
  )
}
