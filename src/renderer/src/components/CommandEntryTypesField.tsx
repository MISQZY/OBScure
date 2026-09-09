import { X } from 'lucide-react'
import {
  Button,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui'
import { useI18n } from '@/providers/I18nProvider'
import type { CommandEntryType } from '@shared/eventsConfig'

interface CommandEntryTypesFieldProps {
  id: string
  label: string
  value: CommandEntryType[]
  onChange: (value: CommandEntryType[]) => void
}

const ENTRY_TYPES: CommandEntryType[] = ['followers', 'subscribers']

/**
 * Who's allowed to use a command — a trigger button + popover shaped exactly
 * like ChatCommandField's own (removable chips, a picker to add another),
 * not a plain checkbox row, so the two permission-adjacent controls on
 * CommandsPage read as one consistent pattern. A viewer is eligible if they
 * belong to *any* chip here; no chips means everyone (no restriction). A
 * permission, not part of the trigger phrase, so it's its own field next to
 * ChatCommandField rather than folded into that popover.
 */
export function CommandEntryTypesField({ id, label, value, onChange }: CommandEntryTypesFieldProps) {
  const { t } = useI18n()
  const entryTypeLabels: Record<CommandEntryType, string> = {
    followers: t.chatCommand.entryModeFollowers,
    subscribers: t.chatCommand.entryModeSubscribers
  }
  const available = ENTRY_TYPES.filter((type) => !value.includes(type))

  const addType = (type: string): void => {
    if (!ENTRY_TYPES.includes(type as CommandEntryType) || value.includes(type as CommandEntryType)) return
    onChange([...value, type as CommandEntryType])
  }

  const removeType = (type: CommandEntryType): void => {
    onChange(value.filter((entryType) => entryType !== type))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" size="sm" className="w-fit max-w-64 justify-start truncate font-mono">
            {value.length > 0 ? value.map((type) => entryTypeLabels[type]).join(', ') : t.chatCommand.entryModeAll}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-72 flex-col gap-1.5" align="start">
          <Label>{t.chatCommand.entryModeLabel}</Label>
          {value.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {value.map((type) => (
                <span key={type} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs">
                  {entryTypeLabels[type]}
                  <button
                    type="button"
                    onClick={() => removeType(type)}
                    aria-label={t.chatCommand.removeAlias}
                    title={t.chatCommand.removeAlias}
                    className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {available.length > 0 && (
            <Select value="" onValueChange={addType}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder={t.chatCommand.addEntryType} />
              </SelectTrigger>
              <SelectContent>
                {available.map((type) => (
                  <SelectItem key={type} value={type}>
                    {entryTypeLabels[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
