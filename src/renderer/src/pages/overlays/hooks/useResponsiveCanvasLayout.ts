import { useEffect, useRef, useState } from 'react'

/**
 * Tracks the canvas wrapper's own width (NOT window.innerWidth, since this
 * page sits next to the app's own sidebar/titlebar chrome and the three
 * floating toolbar/palette/preview <Panel>s are positioned relative to this
 * element, not the viewport) and derives the two breakpoints the three
 * panels collapse at, so they stop painting over each other on a narrow
 * window — see isCompact/isNarrow's own doc comments below.
 */
export function useResponsiveCanvasLayout() {
  /**
   * null until the first ResizeObserver callback fires, in which case every
   * panel renders at its normal (wide-window) layout rather than flashing
   * hidden for one frame.
   */
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = canvasWrapperRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width != null) setContainerWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /**
   * Below this, the top-right live preview is hidden — it's a decorative
   * mirror of the real overlay (Test/Play already exercise the real thing),
   * the first thing worth giving up when space is tight. The centered
   * toolbar is a fixed 27rem (432px, see its own className comment in
   * SceneBuilderToolbar) so it clears BOTH side panels at once (Add Node
   * ~200px + preview ~336px) only once the canvas is roughly
   * 432 + 2*216 + margins ≈ 1120px — that's where this threshold comes
   * from, not an arbitrary guess.
   */
  const isCompact = containerWidth !== null && containerWidth < 1120
  /**
   * Below this, even the Add Node palette (already the narrowest of the
   * three panels) collapses into a toggle button — see the paletteOpen
   * state below. Toolbar (fixed 432px) + Add Node alone still need
   * roughly 432 + 2*200 ≈ 830px to clear each other; the app's own
   * default window (960px, minus the sidebar) lands right in this range,
   * which is exactly the overlap this was written to fix — this isn't
   * just a "very narrow window" edge case.
   */
  const isNarrow = containerWidth !== null && containerWidth < 850

  return { canvasWrapperRef, containerWidth, isCompact, isNarrow }
}
