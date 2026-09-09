import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Input,
  Label
} from '@/components/ui'
import { ChatCommandField } from '@/components/ChatCommandField'
import { CommandEntryTypesField } from '@/components/CommandEntryTypesField'
import { useCommands } from '@/providers/CommandsProvider'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'
import type { Dictionary } from '@/lib/i18n/types'
import type { CommandDef } from '@shared/eventsConfig'

function blankCommand(t: Dictionary, index: number): CommandDef {
  return {
    id: `command-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: `${t.commands.defaultNamePrefix} ${index}`,
    aliases: [],
    hasPrefix: true,
    prefix: '!',
    entryTypes: []
  }
}

/**
 * "Команды" — a single registry of chat commands (Streamer.bot's own
 * Commands page is the model), each with its own name/aliases/prefix/
 * permission. Roulette and Actions no longer edit that shape inline —
 * they pick one of these by name from a dropdown (see CommandSelectField),
 * so renaming an alias or flipping who can use it here updates every place
 * that references it.
 */
export function CommandsPage() {
  const { t } = useI18n()
  const { commands, saveCommand, deleteCommand } = useCommands()

  const nameExists = (name: string, excludeId?: string): boolean =>
    commands.some((c) => c.id !== excludeId && c.name.toLowerCase() === name.toLowerCase())

  const addCommand = async (): Promise<void> => {
    let index = commands.length + 1
    let candidate = blankCommand(t, index)
    while (nameExists(candidate.name)) {
      index += 1
      candidate = blankCommand(t, index)
    }
    await saveCommand(candidate)
  }

  const patchCommand = async (command: CommandDef, patch: Partial<CommandDef>): Promise<void> => {
    await saveCommand({ ...command, ...patch })
  }

  const renameCommand = async (command: CommandDef, rawName: string): Promise<void> => {
    const name = rawName.trim()
    if (!name || nameExists(name, command.id) || name === command.name) return
    await patchCommand(command, { name })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.commands.title}</h1>
          <p className="text-sm text-muted-foreground">{t.commands.description}</p>
        </div>
        <Button onClick={addCommand} size="sm">
          {t.commands.add}
        </Button>
      </div>

      {commands.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.commands.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {commands.map((command) => (
            <li key={command.id} className="flex flex-wrap items-end gap-3 rounded-lg border bg-card px-3 py-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${command.id}-name`}>{t.commands.namePlaceholder}</Label>
                <Input
                  id={`${command.id}-name`}
                  defaultValue={command.name}
                  key={`${command.id}-name-${command.name}`}
                  className="w-44"
                  onBlur={(event) => void renameCommand(command, event.target.value)}
                />
              </div>

              <ChatCommandField
                id={`${command.id}-trigger`}
                label={t.commands.triggerLabel}
                aliasPlaceholder={t.commands.aliasPlaceholder}
                value={command}
                onChange={(value) => void patchCommand(command, value)}
              />

              <CommandEntryTypesField
                id={`${command.id}-entry-types`}
                label={t.chatCommand.entryModeLabel}
                value={command.entryTypes}
                onChange={(entryTypes) => void patchCommand(command, { entryTypes })}
              />

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="ml-auto flex shrink-0 items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title={t.commands.deleteTooltip}
                    aria-label={t.commands.deleteTooltip}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>{interpolate(t.commands.deleteConfirm, { name: command.name })}</AlertDialogTitle>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => deleteCommand(command.id)}>
                      {t.common.delete}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
