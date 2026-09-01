import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SortableCardProps {
  id: string
  dragHandleLabel: string
  /** Receives the drag handle so the caller can drop it into its own header row (e.g. CollapsibleSection's headerExtra). */
  children: (dragHandle: ReactNode) => ReactNode
}

/** Wraps a dashboard card in dnd-kit's sortable machinery; the card itself only ever moves by its grip handle. */
export function SortableCard({ id, dragHandleLabel, children }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const dragHandle = (
    <button
      type="button"
      aria-label={dragHandleLabel}
      className="cursor-grab touch-none text-muted-foreground outline-none hover:text-foreground active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </button>
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border border-border bg-card/40 p-4',
        isDragging && 'relative z-10 shadow-lg'
      )}
    >
      {children(dragHandle)}
    </div>
  )
}
