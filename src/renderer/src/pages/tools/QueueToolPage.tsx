import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  Button,
  Checkbox,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui'
import { ChatCommandField } from '@/components/ChatCommandField'
import { useI18n } from '@/providers/I18nProvider'
import { DEFAULT_QUEUE_CONFIG, type QueueConfig, type QueueTriggerType } from '@shared/eventsConfig'
import type { QueueStatePayload } from '@shared/types'

const IDLE_STATE: QueueStatePayload = { isOpen: false, entries: [] }

export function QueueToolPage() {
  const { t } = useI18n()
  const [config, setConfig] = useState<QueueConfig>(DEFAULT_QUEUE_CONFIG)
  const [saved, setSaved] = useState(false)
  const [state, setState] = useState<QueueStatePayload>(IDLE_STATE)
  const [manualName, setManualName] = useState('')

  useEffect(() => {
    window.obscure.getEventsConfig('queue').then(setConfig)
    window.obscure.getQueueState().then(setState)
    return window.obscure.onQueueState(setState)
  }, [])

  const save = async (): Promise<void> => {
    const normalized = await window.obscure.setEventsConfig('queue', config)
    setConfig(normalized)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const toggleOpen = async (): Promise<void> => {
    setState(state.isOpen ? await window.obscure.closeQueue() : await window.obscure.openQueue())
  }

  const addManual = async (): Promise<void> => {
    if (!manualName.trim()) return
    setState(await window.obscure.addQueueEntry(manualName))
    setManualName('')
  }

  const removeEntry = async (id: string): Promise<void> => {
    setState(await window.obscure.removeQueueEntry(id))
  }

  const callNext = async (): Promise<void> => {
    const { state: nextState } = await window.obscure.popQueueNext()
    setState(nextState)
  }

  const clear = async (): Promise<void> => {
    setState(await window.obscure.clearQueue())
  }

  const sourceLabel = {
    chat: t.events.queue.entrySourceChat,
    streamerbot: t.events.queue.entrySourceStreamerbot,
    manual: t.events.queue.entrySourceManual
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.events.queue.title}</h1>
        <p className="text-sm text-muted-foreground">{t.events.queue.description}</p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-end gap-4">
          <ChatCommandField
            id="queue-command"
            label={t.events.queue.commandLabel}
            aliasPlaceholder={t.events.queue.commandPlaceholder}
            hint={t.events.queue.commandHint}
            value={config.command}
            onChange={(value) => setConfig((c) => ({ ...c, command: value }))}
          />
          <Button onClick={save} variant="outline">
            {saved ? t.common.saved : t.common.save}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="queue-streamerbot-enabled"
            checked={config.streamerbotEnabled}
            onCheckedChange={(checked) => setConfig((c) => ({ ...c, streamerbotEnabled: !!checked }))}
          />
          <Label htmlFor="queue-streamerbot-enabled">{t.events.queue.streamerbotEnabledLabel}</Label>
        </div>

        {config.streamerbotEnabled && (
          <div className="flex flex-col gap-3 border-l-2 border-border pl-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="queue-trigger-type">{t.events.queue.triggerTypeLabel}</Label>
              <Select
                value={config.streamerbotTriggerType}
                onValueChange={(value) => setConfig((c) => ({ ...c, streamerbotTriggerType: value as QueueTriggerType }))}
              >
                <SelectTrigger id="queue-trigger-type" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customEvent">{t.events.queue.triggerTypeCustomEvent}</SelectItem>
                  <SelectItem value="command">{t.events.queue.triggerTypeCommand}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {config.streamerbotTriggerType === 'customEvent' ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="queue-event-name">{t.events.queue.eventNameLabel}</Label>
                  <Input
                    id="queue-event-name"
                    className="w-64"
                    value={config.streamerbotEventName}
                    onChange={(event) => setConfig((c) => ({ ...c, streamerbotEventName: event.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="queue-name-arg-key">{t.events.queue.nameArgKeyLabel}</Label>
                  <Input
                    id="queue-name-arg-key"
                    className="w-40"
                    value={config.streamerbotNameArgKey}
                    onChange={(event) => setConfig((c) => ({ ...c, streamerbotNameArgKey: event.target.value }))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t.events.queue.customEventHint}</p>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="queue-command-name">{t.events.queue.commandNameLabel}</Label>
                  <Input
                    id="queue-command-name"
                    className="w-64"
                    value={config.streamerbotCommandName}
                    onChange={(event) => setConfig((c) => ({ ...c, streamerbotCommandName: event.target.value }))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t.events.queue.commandNameHint}</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card/50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={toggleOpen} size="sm" variant={state.isOpen ? 'outline' : 'default'}>
            {state.isOpen ? t.events.queue.close : t.events.queue.open}
          </Button>
          <Button onClick={callNext} size="sm" variant="outline" disabled={state.entries.length === 0}>
            {t.events.queue.callNext}
          </Button>
          <Button onClick={clear} size="sm" variant="outline" disabled={state.entries.length === 0}>
            {t.events.queue.clear}
          </Button>
          <span className="text-sm text-muted-foreground">
            {state.isOpen ? t.events.queue.statusOpen : t.events.queue.statusClosed}
          </span>
        </div>

        {state.isOpen && (
          <div className="flex items-center gap-2">
            <Input
              placeholder={t.events.queue.namePlaceholder}
              className="w-48"
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void addManual()
              }}
            />
            <Button variant="outline" size="sm" onClick={addManual}>
              {t.events.queue.addManual}
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>
            {t.events.queue.entries} ({state.entries.length})
          </Label>
          {state.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.events.queue.noEntries}</p>
          ) : (
            <ScrollArea className="h-80">
              <ol className="flex flex-col gap-1.5 pr-3">
                {state.entries.map((entry, index) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
                  >
                    <span className="w-6 shrink-0 text-muted-foreground">{index + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{sourceLabel[entry.source]}</span>
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      aria-label={t.events.queue.removeEntry}
                      title={t.events.queue.removeEntry}
                      className="shrink-0 rounded-full p-0.5 hover:bg-accent"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ol>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  )
}
