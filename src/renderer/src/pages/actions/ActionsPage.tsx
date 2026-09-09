import { useEffect, useState } from 'react'
import { Bot, Play, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
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
import { CommandSelectField } from '@/components/CommandSelectField'
import { NumberInput, numberInputClass } from '@/components/nodes'
import { useCommands } from '@/providers/CommandsProvider'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'
import { cn } from '@/lib/utils'
import { useIntegrationStatus } from '@/hooks/use-integration-status'
import { useCustomOverlays } from '@/providers/CustomOverlaysProvider'
import type { Dictionary } from '@/lib/i18n/types'
import {
  MAX_ACTION_DURATION_SECONDS,
  MIN_ACTION_DURATION_SECONDS,
  type ActionConfig,
  type ActionTriggerType
} from '@shared/eventsConfig'
import type { ActionQueueRuntimeState } from '@shared/types'

function blankAction(t: Dictionary, index: number, queueId: string, sceneUrlKey: string): ActionConfig {
  return {
    id: `action-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: `${t.actions.defaultNamePrefix} ${index}`,
    sceneUrlKey,
    queueId,
    durationSeconds: 5,
    commandId: null,
    streamerbotEnabled: false,
    streamerbotTriggerType: 'customEvent',
    streamerbotCommandName: '',
    streamerbotEventName: ''
  }
}

/**
 * Streamer.bot trigger settings, bundled behind a popover the same way
 * ChatCommandField bundles a chat command — an Action's streamerbotEnabled/
 * streamerbotTriggerType/streamerbotCommandName/streamerbotEventName are
 * really one setting split across four fields, same reasoning as
 * ChatCommandField's own doc comment. Unlike the old Queue tool's own
 * version of this block, there's no "name argument key" field — an Action
 * has no entrant name to extract, it just plays a scene. Renders nothing
 * while the Streamer.bot integration itself isn't connected — there's
 * nothing this trigger could actually fire from until it is, and an
 * already-configured Action keeps working via its chat command regardless.
 */
function ActionStreamerbotField({
  id,
  action,
  onChange
}: {
  id: string
  action: ActionConfig
  onChange: (patch: Partial<ActionConfig>) => void
}) {
  const { t } = useI18n()
  const [streamerbotStatus] = useIntegrationStatus('streamerbot')
  const summary = action.streamerbotEnabled
    ? action.streamerbotTriggerType === 'command'
      ? t.actions.triggerTypeCommand
      : t.actions.triggerTypeCustomEvent
    : t.chatCommand.disabled
  const label = `Streamer.bot: ${summary}`

  if (streamerbotStatus !== 'connected') return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/*
          Plain icon <button>, not the shadcn Button component — matches
          Scene Builder's own toolbar buttons (SceneBuilderToolbar.tsx:
          rounded-md/border, muted by default, tinted when "on" the same
          way its own Test button tints red on testStatus === 'error')
          instead of this page's other shadcn-styled controls. Sized to
          ChatCommandField's own h-7 trigger button (not Scene Builder's
          p-2, which comes out taller at this icon size) and self-aligned
          to the bottom of the row (see its flex-end parent) so the two
          sit flush, same footprint either side.
        */}
        <button
          id={id}
          type="button"
          title={label}
          aria-label={label}
          className={cn(
            'flex size-7 items-center justify-center rounded-md border transition-colors',
            action.streamerbotEnabled
              ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Bot className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-80 flex-col gap-3" align="start">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-enabled`}
            checked={action.streamerbotEnabled}
            onCheckedChange={(checked) => onChange({ streamerbotEnabled: !!checked })}
          />
          <Label htmlFor={`${id}-enabled`}>{t.actions.streamerbotEnabledLabel}</Label>
        </div>

        {action.streamerbotEnabled && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-trigger-type`}>{t.actions.triggerTypeLabel}</Label>
              <Select
                value={action.streamerbotTriggerType}
                onValueChange={(value) => onChange({ streamerbotTriggerType: value as ActionTriggerType })}
              >
                <SelectTrigger id={`${id}-trigger-type`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customEvent">{t.actions.triggerTypeCustomEvent}</SelectItem>
                  <SelectItem value="command">{t.actions.triggerTypeCommand}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {action.streamerbotTriggerType === 'customEvent' ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-event-name`}>{t.actions.eventNameLabel}</Label>
                <Input
                  id={`${id}-event-name`}
                  value={action.streamerbotEventName}
                  onChange={(event) => onChange({ streamerbotEventName: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t.actions.customEventHint}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-command-name`}>{t.actions.commandNameLabel}</Label>
                <Input
                  id={`${id}-command-name`}
                  value={action.streamerbotCommandName}
                  onChange={(event) => onChange({ streamerbotCommandName: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t.actions.commandNameHint}</p>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * "Действия" — the Streamer.bot-shaped replacement for the old single
 * viewer Queue tool: each Action here is a named, reusable trigger (chat
 * command and/or Streamer.bot push event) that plays one Scene Builder
 * scene and lands in one of the named queues managed on QueuesPage. See
 * ActionConfig's own doc comment (shared/eventsConfig.ts) for why "play a
 * scene" is the only Action type for now.
 */
export function ActionsPage() {
  const { t } = useI18n()
  const { overlays } = useCustomOverlays()
  const { commands } = useCommands()
  const [actions, setActions] = useState<ActionConfig[]>([])
  const [queues, setQueues] = useState<ActionQueueRuntimeState[]>([])

  useEffect(() => {
    window.obscure.getActions().then(setActions)
    window.obscure.getActionQueuesState().then(setQueues)
    return window.obscure.onActionQueuesState(setQueues)
  }, [])

  const nameExists = (name: string, excludeId?: string): boolean =>
    actions.some((a) => a.id !== excludeId && a.name.toLowerCase() === name.toLowerCase())

  const addAction = async (): Promise<void> => {
    const defaultQueueId = queues[0]?.id ?? 'default'
    const defaultScene = overlays[0]?.urlKey ?? ''
    let index = actions.length + 1
    let candidate = blankAction(t, index, defaultQueueId, defaultScene)
    while (nameExists(candidate.name)) {
      index += 1
      candidate = blankAction(t, index, defaultQueueId, defaultScene)
    }
    setActions(await window.obscure.saveAction(candidate))
  }

  const patchAction = async (action: ActionConfig, patch: Partial<ActionConfig>): Promise<void> => {
    setActions(await window.obscure.saveAction({ ...action, ...patch }))
  }

  const renameAction = async (action: ActionConfig, rawName: string): Promise<void> => {
    const name = rawName.trim()
    if (!name || nameExists(name, action.id) || name === action.name) return
    await patchAction(action, { name })
  }

  const deleteAction = async (id: string): Promise<void> => {
    setActions(await window.obscure.deleteAction(id))
  }

  const runAction = (id: string): void => {
    void window.obscure.runAction(id)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.actions.title}</h1>
          <p className="text-sm text-muted-foreground">{t.actions.description}</p>
        </div>
        <Button onClick={addAction} disabled={overlays.length === 0} size="sm">
          {t.actions.add}
        </Button>
      </div>

      {overlays.length === 0 && <p className="text-sm text-muted-foreground">{t.actions.noScenes}</p>}

      {actions.length === 0 ? (
        overlays.length > 0 && <p className="text-sm text-muted-foreground">{t.actions.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {actions.map((action) => (
            <li key={action.id} className="flex flex-col gap-3 rounded-lg border bg-card px-3 py-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${action.id}-name`}>{t.actions.namePlaceholder}</Label>
                  <Input
                    id={`${action.id}-name`}
                    defaultValue={action.name}
                    key={`${action.id}-name-${action.name}`}
                    className="w-44"
                    onBlur={(event) => void renameAction(action, event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${action.id}-scene`}>{t.actions.sceneLabel}</Label>
                  <Select value={action.sceneUrlKey} onValueChange={(value) => void patchAction(action, { sceneUrlKey: value })}>
                    <SelectTrigger id={`${action.id}-scene`} className="w-44">
                      <SelectValue placeholder={t.actions.scenePlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {overlays.map((overlay) => (
                        <SelectItem key={overlay.id} value={overlay.urlKey}>
                          {overlay.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${action.id}-queue`}>{t.actions.queueLabel}</Label>
                  <Select value={action.queueId} onValueChange={(value) => void patchAction(action, { queueId: value })}>
                    <SelectTrigger id={`${action.id}-queue`} className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {queues.map((queue) => (
                        <SelectItem key={queue.id} value={queue.id}>
                          {queue.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>{t.actions.durationLabel}</Label>
                  {/* Same custom-styled stepper every node property panel uses instead of a
                      native <input type="number">'s own (unstyled, theme-mismatched) spin
                      buttons — see NumberInput's own doc comment. */}
                  <NumberInput
                    value={action.durationSeconds}
                    onChange={(value) => {
                      if (value !== null) void patchAction(action, { durationSeconds: value })
                    }}
                    min={MIN_ACTION_DURATION_SECONDS}
                    max={MAX_ACTION_DURATION_SECONDS}
                    fallback={action.durationSeconds}
                    className={cn(numberInputClass, 'h-8 w-24')}
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!action.sceneUrlKey}
                  onClick={() => runAction(action.id)}
                  title={t.actions.runNow}
                >
                  <Play className="size-3.5" />
                  {t.actions.runNow}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="ml-auto flex shrink-0 items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title={t.actions.deleteTooltip}
                      aria-label={t.actions.deleteTooltip}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogTitle>{interpolate(t.actions.deleteConfirm, { name: action.name })}</AlertDialogTitle>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => deleteAction(action.id)}>
                        {t.common.delete}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <CommandSelectField
                  id={`${action.id}-command`}
                  label={t.actions.commandLabel}
                  commands={commands}
                  value={action.commandId}
                  onChange={(commandId) => void patchAction(action, { commandId })}
                />
                <ActionStreamerbotField
                  id={`${action.id}-streamerbot`}
                  action={action}
                  onChange={(patch) => void patchAction(action, patch)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
