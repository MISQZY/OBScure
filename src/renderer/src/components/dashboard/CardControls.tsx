import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/providers/I18nProvider'

interface CardControlsProps {
  dragHandle: ReactNode
  onRemove: () => void
}

/** Drag handle + remove button, rendered together as a dashboard card's headerExtra. */
export function CardControls({ dragHandle, onRemove }: CardControlsProps) {
  const { t } = useI18n()

  return (
    <div className="flex items-center gap-1">
      {dragHandle}
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
