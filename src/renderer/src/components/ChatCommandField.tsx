import { useState } from 'react'
import { X } from 'lucide-react'
import {
  Button,
  Checkbox,
  Input,
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
import { commandTriggerWords, type CommandConfig, type CommandEntryMode } from '@shared/eventsConfig'

interface ChatCommandFieldProps {
  id: string
  label: string
  aliasPlaceholder?: string
  hint?: string
  value: CommandConfig
  onChange: (value: CommandConfig) => void
}

/**
 * A chat command edited as its own popover instead of a single free-text
 * field — CommandConfig bundles three genuinely separate settings (which
 * words trigger it, whether they carry a shared prefix, who's allowed to
 * use it), so this opens them together behind one button rather than
 * spreading three controls across the page. The trigger button itself shows
 * the resolved trigger words live (e.g. "!рулетка, !roulette") so the
 * current config is readable without opening the popover.
 */
export function ChatCommandField({ id, label, aliasPlaceholder, hint, value, onChange }: ChatCommandFieldProps) {
  const { t } = useI18n()
  const [newAlias, setNewAlias] = useState('')
  const triggers = commandTriggerWords(value)

  const addAlias = (): void => {
    const trimmed = newAlias.trim()
    if (!trimmed) return
    if (value.aliases.some((alias) => alias.toLowerCase() === trimmed.toLowerCase())) {
      setNewAlias('')
      return
    }
    onChange({ ...value, aliases: [...value.aliases, trimmed] })
    setNewAlias('')
  }

  const removeAlias = (alias: string): void => {
    onChange({ ...value, aliases: value.aliases.filter((a) => a !== alias) })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" size="sm" className="w-fit max-w-64 justify-start truncate font-mono">
            {triggers.length > 0
              ? triggers.length > 1
                ? `${triggers[0]} +${triggers.length - 1}`
                : triggers[0]
              : t.chatCommand.disabled}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-80 flex-col gap-3" align="start">
          <div className="flex flex-col gap-1.5">
            <Label>{t.chatCommand.aliasesLabel}</Label>
            {value.aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {value.aliases.map((alias) => (
                  <span key={alias} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs">
                    {alias}
                    <button
                      type="button"
                      onClick={() => removeAlias(alias)}
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
            <div className="flex gap-1.5">
              <Input
                value={newAlias}
                placeholder={aliasPlaceholder}
                className="h-7 text-xs"
                onChange={(event) => setNewAlias(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addAlias()
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" className="h-7" onClick={addAlias}>
                {t.common.add}
              </Button>
            </div>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-has-prefix`}
              checked={value.hasPrefix}
              onCheckedChange={(checked) => onChange({ ...value, hasPrefix: !!checked })}
            />
            <Label htmlFor={`${id}-has-prefix`} className="text-xs font-normal text-muted-foreground">
              {t.common.hasPrefix}
            </Label>
            {value.hasPrefix && (
              <Input
                className="h-7 w-12 text-center text-xs"
                value={value.prefix}
                onChange={(event) => onChange({ ...value, prefix: event.target.value })}
                aria-label={t.common.prefixLabel}
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-entry-mode`}>{t.chatCommand.entryModeLabel}</Label>
            <Select value={value.entryMode} onValueChange={(next) => onChange({ ...value, entryMode: next as CommandEntryMode })}>
              <SelectTrigger id={`${id}-entry-mode`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.chatCommand.entryModeAll}</SelectItem>
                <SelectItem value="followers">{t.chatCommand.entryModeFollowers}</SelectItem>
                <SelectItem value="subscribers">{t.chatCommand.entryModeSubscribers}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
