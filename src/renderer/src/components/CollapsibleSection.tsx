import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  title: ReactNode
  /** Semantic heading level; also picks the default title styling. */
  level?: 'h2' | 'h3'
  titleClassName?: string
  defaultOpen?: boolean
  className?: string
  /** Rendered on the header row next to the title, outside the trigger (e.g. a "send test" button). */
  headerExtra?: ReactNode
  /**
   * data-tour id for the onboarding walkthrough (see TourOverlay). Set on the
   * section's root, whose header stays rendered (and correctly positioned)
   * even while its content is collapsed.
   */
  tourId?: string
  /** Indents content to align under the title text (skipping the chevron column). Default true. */
  indentContent?: boolean
  children: ReactNode
}

const DEFAULT_TITLE_CLASS: Record<'h2' | 'h3', string> = {
  h2: 'text-base font-semibold',
  h3: 'text-sm font-medium'
}

/** Turns a settings section's h2/h3 heading into a collapsible disclosure trigger. */
export function CollapsibleSection({
  title,
  level = 'h2',
  titleClassName,
  defaultOpen = true,
  className,
  headerExtra,
  tourId,
  indentContent = true,
  children
}: CollapsibleSectionProps) {
  const Heading = level

  return (
    <Collapsible data-tour={tourId} defaultOpen={defaultOpen} className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger className="group flex flex-1 cursor-pointer items-center gap-1.5 text-left outline-none">
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
          <Heading className={titleClassName ?? DEFAULT_TITLE_CLASS[level]}>{title}</Heading>
        </CollapsibleTrigger>
        {headerExtra}
      </div>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className={cn('flex flex-col gap-3', indentContent && 'pl-5.5')}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
