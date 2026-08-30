import { useRef, useLayoutEffect, useState } from "react";
import { Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { interpolate, Anim, OverflowAutoScroll } from "../sceneUtils";

/**
 * Renders `children` twice back-to-back inside a track animated by CSS
 * (ov-autoscroll-x/-y, defined identically in scene-preview-animations.css
 * and overlays/animations.css) — the standard seamless-marquee trick:
 * translating the track by exactly -50% of its own size always lands on the
 * SECOND copy's start, which is pixel-identical to the first copy's start
 * (both copies are the same content), so the loop never visibly snaps or
 * resets. The PARENT element still needs its own `overflow: hidden`/`auto`
 * — that's the Overflow modifier's plain style fields (via modifierStyle),
 * already applied on the caller's own wrapper; this only ever supplies the
 * motion. No `gap` between the two copies — a gap would break the exact 50%
 * math the loop depends on. `flexShrink: 0` on the track itself (not just
 * the two copies) defends against the flexbox "min-height:auto" shrink
 * trap — a flex item can otherwise be squeezed below its content size by a
 * fixed-size ancestor with no visible symptom except silently-wrong content.
 *
 * `scroll.speed` is px/second, not a loop duration (see overflowAutoScroll's
 * own doc comment for why) — this measures its OWN first copy's real
 * rendered size (ResizeObserver, so it re-measures if content/fonts change,
 * e.g. Roulette Entrants gaining a row) and sets `animation-duration` from
 * that, instead of a fixed guess. Nothing animates until the first
 * measurement lands (`animationCss` starts undefined) — a brief flash of
 * static content beats a wrong, too-fast pass.
 *
 * `anchorRef` pins a start time AND the duration it was computed from the
 * first time this instance measures, and keeps reusing both across later
 * ResizeObserver firings unless the measured size ACTUALLY changed by a
 * whole pixel. That first version recomputed `durationSec` fresh from every
 * single measurement — layout isn't perfectly bit-identical fire to fire
 * (a fraction-of-a-pixel difference is enough), so the modulo phase math
 * below (elapsedSec % durationSec) drifted out of sync with wherever the
 * animation actually visually was, compounding over time into a visible
 * snap right around when a lap would otherwise complete. Pinning both
 * removes that drift entirely for the (overwhelmingly common) case where
 * nothing about the content actually changed size between firings. A plain
 * ref (not state) since it only needs to persist for the life of this
 * mounted instance, never trigger a re-render itself.
 */
function AutoScrollTrack({ scroll, children }: { scroll: NonNullable<OverflowAutoScroll>; children: React.ReactNode }) {
  const copyRef = useRef<HTMLDivElement>(null)
  const [animationCss, setAnimationCss] = useState<string | undefined>(undefined)
  const anchorRef = useRef<{ startedAt: number; size: number; durationSec: number } | null>(null)

  useLayoutEffect(() => {
    const el = copyRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      const size = scroll.axis === 'x' ? rect.width : rect.height
      if (size <= 0) {
        setAnimationCss(undefined)
        return
      }
      const rounded = Math.round(size)
      let anchor = anchorRef.current
      if (!anchor) {
        anchor = { startedAt: Date.now(), size: rounded, durationSec: rounded / scroll.speed }
        anchorRef.current = anchor
      } else if (anchor.size !== rounded) {
        anchor.size = rounded
        anchor.durationSec = rounded / scroll.speed
      }
      const elapsedSec = (Date.now() - anchor.startedAt) / 1000
      const delaySec = -(elapsedSec % anchor.durationSec)
      setAnimationCss(`ov-autoscroll-${scroll.axis} ${anchor.durationSec}s linear ${delaySec}s infinite${scroll.reverse ? ' reverse' : ''}`)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scroll.axis, scroll.speed, scroll.reverse])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: scroll.axis === 'x' ? 'row' : 'column',
        flexShrink: 0,
        width: scroll.axis === 'x' ? 'max-content' : undefined,
        willChange: 'transform',
        animation: animationCss
      }}
    >
      <div ref={copyRef} style={{ flexShrink: 0 }}>{children}</div>
      <div style={{ flexShrink: 0 }} aria-hidden="true">{children}</div>
    </div>
  )
}


export function TextView({
  node,
  style,
  anim,
  played,
  hiding,
  vars,
  contentValues,
  replaceText,
  crossAxis,
  autoScroll
}: {
  node: Node
  style: React.CSSProperties
  anim: Anim
  played: boolean
  /** Playing its exit (reverse of entrance) — see the doc comment on ScenePreview's eventState handling. */
  hiding: boolean
  /** Current event's placeholder values (see sceneTrigger) — null outside an event-triggered show. */
  vars: Record<string, unknown> | null
  /** { artist, title } from Audio Player's Content wire into this node's own Content socket — null when it isn't wired in. See audioContentValues. Merged into `vars` below, same as buildText merges the live feed in overlays/custom.html; Content's own template still decides what's shown. */
  contentValues: Record<string, unknown> | null
  /** Roulette Entrants' formatted rows, when THIS node's own Content socket is wired to one — see rouletteEntrantsTextValue. Non-null REPLACES the template outright (ignores `data.text`/`contentValues`/`vars` entirely), unlike contentValues above which only ever supplies values a template still interpolates — see TextNode.tsx's own doc comment for why the node's textarea goes read-only in this case. */
  replaceText: string | null
  /** From the same Overflow modifier `style` was built from — see overflowAutoScroll's own doc comment. Null renders the text plainly (unchanged from before this existed); set, it wraps the text in an AutoScrollTrack instead. */
  autoScroll?: OverflowAutoScroll
  /**
   * The CROSS axis of whichever Box/Scene this Text is a direct child of
   * (crossAxisFor, computed by the caller off THAT parent's own Ordering) —
   * the axis flexbox's `items-center` (Scene/BoxView's own fixed cross-axis
   * rule) actually leaves room along. Align/Vertical below only stretch
   * this element (alignSelf) to fill that room when it's the relevant one
   * AND the field was actually changed from its default, so a Text using
   * default settings renders pixel-identical to before this existed.
   */
  crossAxis: 'horizontal' | 'vertical'
}) {
  // Bold defaults true (data.bold !== false) — see the matching comment on
  // TextNode in components/nodes/index.tsx: font-weight:700 used to be
  // hardcoded here unconditionally, so every pre-existing Text node must
  // keep rendering bold unless explicitly turned off now that it's a field.
  const bold = node.data.bold !== false
  const italic = Boolean(node.data.italic)
  const align = (node.data.align as 'left' | 'center' | 'right' | 'justify') || 'left'
  const verticalAlign = (node.data.verticalAlign as string) || 'top'
  // A Position modifier's own anchor (top-left/top-right/center/...) is
  // meant to place this element's OWN box at that corner — but the
  // unconditional width:100% below (kept for the in-flow/in-box case, so
  // Align has room to matter there) means the box already spans the full
  // parent width regardless of which corner is picked, so every anchor
  // ends up looking the same. Once something has actually anchored it
  // (position:absolute) AND no Size gives it a real width of its own (see
  // modifierStyle), let it shrink back to its own content instead so the
  // anchor actually differs.
  const isAnchored = style.position === 'absolute' && style.width == null
  const needsStretch = crossAxis === 'horizontal' ? align !== 'left' : verticalAlign !== 'top'
  return (
    <div
      className={cn(anim && played && 'visible', anim && hiding && 'hiding')}
      data-animation={anim?.type}
      style={
        {
          width: isAnchored ? 'auto' : '100%',
          display: 'flex',
          flexDirection: 'column',
          // Auto-scroll's keyframes (ov-autoscroll-y) assume the track
          // starts flush against this box's OWN top edge — translateY(0) IS
          // "show the very top of copy1". Vertical/'middle' or 'bottom'
          // instead CENTERS/bottom-aligns the (always taller, by design)
          // track within this box before the animation ever runs, offsetting
          // that starting point by however much the track overflows — which
          // silently breaks the translateY(0)->(-50%) math (it was derived
          // assuming a flex-start base position), showing a seemingly
          // arbitrary slice of the middle of the list and skipping the rest
          // on each loop instead of sweeping through all of it. Vertical
          // Align is about placing SHORT, non-overflowing content within its
          // box — meaningless once autoScroll guarantees the content always
          // overflows, so it's ignored here rather than fought elsewhere.
          justifyContent: autoScroll ? 'flex-start' : verticalAlign === 'bottom' ? 'flex-end' : verticalAlign === 'middle' ? 'center' : 'flex-start',
          alignSelf: needsStretch ? 'stretch' : undefined,
          // Content's own field is a multi-line textarea — preserves both
          // the line breaks the user typed and normal word-wrapping,
          // instead of CSS's default collapsing every "\n" to a space.
          whiteSpace: 'pre-wrap',
          fontSize: (node.data.fontSize as number) || 32,
          fontWeight: bold ? 700 : 400,
          fontStyle: italic ? 'italic' : 'normal',
          letterSpacing: `${(node.data.letterSpacing as number) ?? 0}px`,
          lineHeight: node.data.lineHeight != null ? (node.data.lineHeight as number) : undefined,
          ...style,
          color: (node.data.color as string) || '#ffffff',
          textAlign: align,
          fontFamily: node.data.fontFamily ? `"${node.data.fontFamily as string}"` : undefined,
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {(() => {
        const content = (replaceText != null ? replaceText : interpolate((node.data.text as string) ?? '', contentValues ? { ...vars, ...contentValues } : vars)) || (
          // Editor-only affordance — see the matching one on BoxView's empty
          // state. An empty Text node has zero natural width, so without this
          // it (and any Box wrapping only it) collapses to a near-invisible
          // sliver once scaled down for the preview panel.
          <span className="opacity-40 italic">{replaceText != null ? 'No entrants' : 'Empty text'}</span>
        )
        return autoScroll ? <AutoScrollTrack scroll={autoScroll}>{content}</AutoScrollTrack> : content
      })()}
    </div>
  )
}
