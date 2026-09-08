import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Root node for a card placed on the dashboard's free-form grid canvas.
 * react-grid-layout clones this element and injects position/size style,
 * drag/resize handlers, AND its resize-handle span directly into `children`
 * — none of that is wired up manually. `children` must be rendered here
 * completely untouched: filtering/rebuilding that array (e.g. to pull the
 * handle out) broke resizing outright, because react-resizable wraps the
 * handle in its own `<DraggableCore>` holding a ref to it, and reshaping the
 * children array confuses React's reconciliation of that wrapper mid-drag.
 * Per-card scrolling lives inside DashboardCardSection instead, precisely to
 * avoid needing to touch this array at all.
 *
 * No border/background/rounding of its own: every card content passed in is
 * wrapped in <BorderGlow> (see DashboardPage's renderCard), which supplies
 * all of that chrome. `overflow-hidden` is deliberately absent too — clipping
 * here would cut off BorderGlow's outer glow, which is meant to bloom past
 * the card's own edge.
 */
export const GridCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function GridCard(
  { className, children, ...rest },
  ref
) {
  return (
    <div ref={ref} className={cn('flex flex-col', className)} {...rest}>
      {children}
    </div>
  )
})
