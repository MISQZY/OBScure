import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { useI18n } from '@/providers/I18nProvider'
import type { CommandDef } from '@shared/eventsConfig'

const NONE_VALUE = '__none__'

interface CommandSelectFieldProps {
  id: string
  label: string
  commands: CommandDef[]
  value: string | null
  onChange: (commandId: string | null) => void
  className?: string
}

/**
 * Picks a command by name from the shared Commands registry (see the
 * "Команды" page) instead of editing its aliases/prefix/permission inline —
 * those live in one place now (ChatCommandField, used only on CommandsPage
 * itself) so renaming a command or flipping its permission updates every
 * feature that references it. "None" (commandId null) disables chat-
 * triggered entry for whichever feature owns this field.
 */
export function CommandSelectField({ id, label, commands, value, onChange, className }: CommandSelectFieldProps) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ?? NONE_VALUE} onValueChange={(next) => onChange(next === NONE_VALUE ? null : next)}>
        <SelectTrigger id={id} className={className ?? 'w-44'}>
          <SelectValue placeholder={t.commands.selectPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>{t.commands.selectNone}</SelectItem>
          {commands.map((command) => (
            <SelectItem key={command.id} value={command.id}>
              {command.name || t.commands.unnamed}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
