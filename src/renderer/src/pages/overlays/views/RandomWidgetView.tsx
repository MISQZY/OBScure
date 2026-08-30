import { Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { RandomSlotMachine } from "../../tools/RandomSlotMachine";
import { SAMPLE_RANDOM_STATE, randomWidgetOrdering, Anim } from "../sceneUtils";

/**
 * What a Random Widget node itself renders (see NODE_SOCKETS.randomWidget/
 * RANDOM_WIDGET_OUTPUTS in components/nodes/constants.ts) — reuses the real
 * RandomSlotMachine component (pages/tools/RandomSlotMachine.tsx) the
 * standalone Random tool page itself renders, fed the fixed
 * SAMPLE_RANDOM_STATE (the editor has no live roll to preview — see that
 * constant's own doc comment). Always shown, regardless of whether this
 * widget's own `visible` socket is wired — same reasoning as
 * RouletteWheelView's own doc comment. Static: `animate` is false, since
 * there's no real roll to animate toward in the editor. `size` (from a
 * wired Size modifier, width falling back to height, then 320 — matching
 * RandomSlotMachine's own baseline) scales the boxes rather than clipping
 * to a fixed box — a slot machine's natural width already depends on how
 * many digits/numbers there are, unlike Roulette's fixed-square wheel.
 * Mirrors buildRandomWidget in overlays/custom.html, which instead reads
 * the REAL live roll, honors the `visible` socket, and does animate the
 * reveal. `mods` — same list `style` was already built from — is read again
 * here for its own Ordering wire (randomWidgetOrdering), which controls how
 * the numbers lay out relative to EACH OTHER once Count is above 1.
 */
export function RandomWidgetView({ node, style, anim, played, hiding, mods }: { node: Node; style: React.CSSProperties; anim: Anim; played: boolean; hiding: boolean; mods: Node[] }) {
  const size = typeof style.width === 'number' ? style.width : typeof style.height === 'number' ? style.height : 320
  const { flexDirection, gap } = randomWidgetOrdering(mods)
  return (
    <div
      className={cn('flex flex-col items-center justify-center shrink-0', anim && played && 'visible', anim && hiding && 'hiding')}
      data-animation={anim?.type}
      style={{ ...style, width: 'auto', height: 'auto', ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {}) } as React.CSSProperties}
    >
      <RandomSlotMachine numbers={SAMPLE_RANDOM_STATE.numbers} min={SAMPLE_RANDOM_STATE.min} max={SAMPLE_RANDOM_STATE.max} animate={false} size={size} flexDirection={flexDirection} gap={gap} />
    </div>
  )
}
