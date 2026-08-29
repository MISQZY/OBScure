import type { CSSProperties } from 'react'

// Electron-only CSS property (Chromium): marks a region as OS-level window-drag
// surface. Not in React's CSSProperties typings, hence the cast.
const DRAG_STYLE = { WebkitAppRegion: 'drag' } as CSSProperties

/**
 * Replaces the native OS titlebar CONTENT (see `titleBarStyle: 'hidden'` in
 * src/main/index.ts) with just a drag region + logo — the minimize/maximize/
 * close buttons themselves are NOT rendered here. Per Electron's own custom
 * titlebar guidance, those are opted back in via `titleBarOverlay` on the
 * BrowserWindow instead: DWM draws them as part of the real native frame, so
 * they track the window's actual bounds with zero lag, something no
 * React/Chromium-rendered button can guarantee during a live resize (there's
 * always a renderer-process repaint in that path, however small). Sized via
 * the `titlebar-area-*` env() vars the platform provides specifically so
 * custom titlebar content doesn't draw underneath that reserved button
 * region — see https://www.electronjs.org/docs/latest/tutorial/custom-title-bar.
 *
 * Two nested elements rather than one: the OUTER div spans the window's full
 * width so its bg/border-bottom run edge to edge, including underneath the
 * native buttons — otherwise (an earlier version had these on one element,
 * sized to titlebar-area-width like the inner div below) the border visibly
 * stopped short right where the reserved button region begins. The INNER
 * div is the one actually sized/offset via titlebar-area-* — that's what
 * needs to avoid the reserved region (for the drag hit-testing), not the
 * background/border.
 *
 * The outer div's height is titlebar-area-height PLUS one extra pixel for
 * the border: Windows paints the native buttons' own background across the
 * exact titlebar-area-height rectangle, on top of our page content — a
 * border-bottom sized to fit exactly inside that rectangle (the first
 * attempt at this fix) still got painted over under the button region. The
 * extra pixel puts the actual border line just below that rectangle, out of
 * the overlay's paint. Sidebar's own top offset (see sidebar.tsx's top-9 ->
 * this height) must stay in sync with this — see the comment there.
 */
export function TitleBar() {
  return (
    <div
      className="flex shrink-0 border-b border-sidebar-border bg-sidebar"
      style={{ height: 'calc(env(titlebar-area-height, 36px) + 1px)' }}
    >
      <div
        className="flex select-none items-center gap-2 pl-3 text-xs font-medium text-sidebar-foreground"
        style={{
          ...DRAG_STYLE,
          marginLeft: 'env(titlebar-area-x, 0)',
          width: 'env(titlebar-area-width, 100%)'
        }}
      >
        <img src="favicon.png" alt="" className="size-5 shrink-0 rounded" />
        <span>OBScure</span>
      </div>
    </div>
  )
}
