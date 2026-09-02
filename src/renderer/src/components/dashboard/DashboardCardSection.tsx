import type { ReactNode } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface DashboardCardSectionProps {
  title: ReactNode
  headerExtra: ReactNode
  tourId?: string
  children: ReactNode
}

/**
 * Header + scrollable content for a dashboard card. Cards used to reuse
 * CollapsibleSection for this, but collapsing stopped making sense once
 * cards became freely resizable grid tiles (and broke outright), so this is
 * the same layout minus the collapse trigger — with the content area scrolling
 * (rather than clipping) once a card is resized shorter than what it holds.
 */
export function DashboardCardSection({ title, headerExtra, tourId, children }: DashboardCardSectionProps) {
  return (
    <div data-tour={tourId} className="flex h-full flex-col gap-3 p-4">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {headerExtra}
      </div>
      <ScrollArea type="auto" className="min-h-0 flex-1">
        <div className="flex flex-col gap-3">{children}</div>
      </ScrollArea>
    </div>
  )
}
