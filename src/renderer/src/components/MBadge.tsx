import { cn } from '@/lib/utils'

/**
 * A small circled "M" badge — used to mark items that require the Maestro
 * tier (or any other premium/meta significance the letter conveys). Drop it
 * next to any label text; it renders inline at the current font size.
 *
 * ```tsx
 * <span>Paratrooper <MBadge /></span>
 * ```
 */
export function MBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center size-4 rounded-full border border-current text-[10px] font-semibold leading-none shrink-0',
        className
      )}
      aria-label="M"
    >
      M
    </span>
  )
}
