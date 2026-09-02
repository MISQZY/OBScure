import { useMemo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { OVERLAY_ICONS, OVERLAY_ICON_NAMES, getOverlayIcon } from '@/lib/overlay-icons'
import { useI18n } from '@/providers/I18nProvider'

/**
 * Small trigger that renders `value`'s icon (or the default) and opens a
 * searchable grid to pick another one. Meant to sit inline in place of a
 * static icon — the trigger is a real <button>, so its parent must not
 * itself be a <button>/<a> (nest it inside a plain div/span instead).
 */
export function IconPicker({
  value,
  onSelect,
  className,
  iconClassName
}: {
  value: string | undefined
  onSelect: (icon: string) => void
  className?: string
  iconClassName?: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return OVERLAY_ICON_NAMES
    return OVERLAY_ICON_NAMES.filter((name) => name.toLowerCase().includes(query))
  }, [search])

  const CurrentIcon = getOverlayIcon(value)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t.sidebar.chooseIcon}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'flex items-center justify-center rounded p-0.5 -m-0.5 shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            className
          )}
        >
          <CurrentIcon className={cn('size-4 shrink-0', iconClassName)} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.sidebar.searchIcons}
          className="mb-2 h-7 text-xs"
        />
        <ScrollArea className="h-48">
          <div className="grid grid-cols-6 gap-1 pr-2">
            {filtered.map((name) => {
              const Icon = OVERLAY_ICONS[name]
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => {
                    onSelect(name)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    value === name && 'bg-primary/15 text-primary'
                  )}
                >
                  <Icon className="size-4" />
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="col-span-6 py-4 text-center text-xs text-muted-foreground">
                {t.sidebar.noIconsFound}
              </p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
