import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'

export const TEXT_ALIGN_BUTTONS = [
  { id: 'left', Icon: AlignLeft, title: 'Left' },
  { id: 'center', Icon: AlignCenter, title: 'Center' },
  { id: 'right', Icon: AlignRight, title: 'Right' },
  { id: 'justify', Icon: AlignJustify, title: 'Justify' }
] as const

export const TEXT_VERTICAL_BUTTONS = [
  { id: 'top', Icon: AlignVerticalJustifyStart, title: 'Top' },
  { id: 'middle', Icon: AlignVerticalJustifyCenter, title: 'Middle' },
  { id: 'bottom', Icon: AlignVerticalJustifyEnd, title: 'Bottom' }
] as const

/** A row of mutually-exclusive icon buttons (Align, Vertical) — the compact node-UI equivalent of TextSettings.tsx's alignment button group elsewhere in the app, since that component's shadcn Button/CollapsibleSection styling doesn't fit inside a node's tight layout. */
export function IconToggleGroup<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: readonly { id: T; Icon: LucideIcon; title: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div className="nodrag flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5 w-fit">
      {options.map(({ id, Icon, title }) => (
        <button
          key={id}
          type="button"
          title={title}
          onClick={() => onChange(id)}
          className={cn(
            'flex items-center justify-center size-6 rounded transition-colors',
            id === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
