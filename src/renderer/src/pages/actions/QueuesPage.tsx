import { useEffect, useState } from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { RotateCcw, Trash2 } from 'lucide-react'
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
  ScrollBar,
  Switch
} from '@/components/ui'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'
import { DEFAULT_ACTION_QUEUE_ID, type ActionConfig } from '@shared/eventsConfig'
import type { ActionQueueRuntimeState } from '@shared/types'

/**
 * "Очереди" — mirrors Streamer.bot's own Queues page (Name/Pending Count/
 * Completed Count/Paused/Blocking) instead of the old single viewer-queue
 * tool. Every Action on ActionsPage lands in one of these; runtime counts
 * live-update via onActionQueuesState (see ActionQueueEngine). A queue in
 * use by at least one Action, or the undeletable Default queue, can't be
 * removed — matches what actionQueues:remove itself refuses server-side.
 */
export function QueuesPage() {
  const { t } = useI18n()
  const [queues, setQueues] = useState<ActionQueueRuntimeState[]>([])
  const [actions, setActions] = useState<ActionConfig[]>([])
  const [newName, setNewName] = useState('')

  useEffect(() => {
    window.obscure.getActionQueuesState().then(setQueues)
    window.obscure.getActions().then(setActions)
    return window.obscure.onActionQueuesState(setQueues)
  }, [])

  const nameExists = (name: string, excludeId?: string): boolean =>
    queues.some((q) => q.id !== excludeId && q.name.toLowerCase() === name.toLowerCase())

  const addQueue = async (): Promise<void> => {
    const name = newName.trim()
    if (!name || nameExists(name)) return
    setQueues(await window.obscure.createActionQueue(name))
    setNewName('')
  }

  const renameQueue = async (queue: ActionQueueRuntimeState, rawName: string): Promise<void> => {
    const name = rawName.trim()
    if (!name || nameExists(name, queue.id) || name === queue.name) return
    setQueues(await window.obscure.renameActionQueue(queue.id, name))
  }

  const setPaused = async (id: string, paused: boolean): Promise<void> => {
    setQueues(await window.obscure.setActionQueuePaused(id, paused))
  }

  const setBlocking = async (id: string, blocking: boolean): Promise<void> => {
    setQueues(await window.obscure.setActionQueueBlocking(id, blocking))
  }

  const resetCompleted = async (id: string): Promise<void> => {
    setQueues(await window.obscure.resetActionQueueCompleted(id))
  }

  const deleteQueue = async (id: string): Promise<void> => {
    setQueues(await window.obscure.removeActionQueue(id))
  }

  const inUseCount = (id: string): number => actions.filter((a) => a.queueId === id).length

  const canAdd = newName.trim().length > 0 && !nameExists(newName.trim())

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.actionQueues.title}</h1>
        <p className="text-sm text-muted-foreground">{t.actionQueues.description}</p>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Input
            placeholder={t.actionQueues.namePlaceholder}
            className="w-48"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canAdd) void addQueue()
            }}
          />
        </div>
        <Button onClick={addQueue} disabled={!canAdd} size="sm">
          {t.actionQueues.add}
        </Button>
      </div>

      <ScrollAreaPrimitive.Root className="w-full overflow-hidden rounded-lg border">
        <ScrollAreaPrimitive.Viewport className="w-full rounded-[inherit] [&>div]:!block">
          <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t.actionQueues.columnName}</th>
              <th className="px-3 py-2 font-medium">{t.actionQueues.columnPending}</th>
              <th className="px-3 py-2 font-medium">{t.actionQueues.columnCompleted}</th>
              <th className="px-3 py-2 font-medium">{t.actionQueues.columnPaused}</th>
              <th className="px-3 py-2 font-medium">{t.actionQueues.columnBlocking}</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {queues.map((queue) => {
              const locked = queue.id === DEFAULT_ACTION_QUEUE_ID || inUseCount(queue.id) > 0
              return (
                <tr key={queue.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <Input
                      defaultValue={queue.name}
                      key={`${queue.id}-name-${queue.name}`}
                      className="h-8 w-40"
                      onBlur={(event) => void renameQueue(queue, event.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums">{queue.pendingCount}</td>
                  <td className="px-3 py-2 tabular-nums">{queue.completedCount}</td>
                  <td className="px-3 py-2">
                    <Switch checked={queue.paused} onCheckedChange={(checked) => void setPaused(queue.id, checked)} />
                  </td>
                  <td className="px-3 py-2">
                    <Switch checked={queue.blocking} onCheckedChange={(checked) => void setBlocking(queue.id, checked)} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void resetCompleted(queue.id)}
                        title={t.actionQueues.resetCompleted}
                        aria-label={t.actionQueues.resetCompleted}
                        className="flex items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-accent"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            disabled={locked}
                            title={
                              queue.id === DEFAULT_ACTION_QUEUE_ID
                                ? t.actionQueues.cannotDeleteDefault
                                : locked
                                  ? t.actionQueues.deleteBlockedByActions
                                  : t.actionQueues.deleteTooltip
                            }
                            aria-label={t.actionQueues.deleteTooltip}
                            className="flex items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogTitle>{interpolate(t.actionQueues.deleteConfirm, { name: queue.name })}</AlertDialogTitle>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => deleteQueue(queue.id)}>
                              {t.common.delete}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          </table>
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar orientation="horizontal" />
      </ScrollAreaPrimitive.Root>
    </div>
  )
}
