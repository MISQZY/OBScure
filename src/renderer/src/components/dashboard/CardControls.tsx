import { GripVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/providers/I18nProvider'

interface CardControlsProps {
  onRemove: () => void
}

/** Drag handle + remove button, rendered together as a dashboard card's headerExtra. */
export function CardControls({ onRemove }: CardControlsProps) {
  const { t } = useI18n()

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={t.dashboard.dragHandle}
        title={t.dashboard.dragHandle}
        className="dashboard-drag-handle cursor-grab touch-none text-muted-foreground outline-none hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t.dashboard.removeCard}
        title={t.dashboard.removeCard}
        onClick={onRemove}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
