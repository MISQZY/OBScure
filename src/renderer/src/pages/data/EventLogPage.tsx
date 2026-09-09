import { useEffect, useRef, useState } from 'react'
import { Button, ScrollArea } from '@/components/ui'
import { useI18n } from '@/providers/I18nProvider'
import type { EventLogEntry } from '@shared/types'

const MAX_ENTRIES = 300

// Module-level so pause state survives navigating away from and back to this
// page — it should only reset to paused on app startup, not on every mount.
let pausedState = true

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

function previewPayload(payload: unknown): string {
  try {
    const json = JSON.stringify(payload)
    if (!json) return ''
    return json.length > 160 ? `${json.slice(0, 160)}…` : json
  } catch {
    return String(payload)
  }
}

/**
 * Данные → Журнал событий: a live "what's happening" feed over a curated
 * slice of the internal EventBus (see EventLog in main/eventLog.ts for which
 * AppEvents keys are tapped and why) — the same role Streamer.bot's own
 * Events panel plays for ITS event sources. Newest entry lands at the top
 * (no autoscroll to manage), Pause freezes the visible list without
 * unsubscribing (so nothing is silently missed, just not shown yet — Resume
 * catches the list back up), and a row expands in place to its full
 * pretty-printed payload on click. Starts paused on app launch: getEventLog's
 * own initial fetch already backfills whatever's in the ring buffer, so
 * opening this page for the first time shouldn't also start silently
 * scrolling that list out from under whoever's reading it. The paused flag
 * lives at module scope so it persists across navigating away and back —
 * only an app restart resets it to paused.
 */
export function EventLogPage() {
  const { t } = useI18n()
  const [entries, setEntries] = useState<EventLogEntry[]>([])
  const [paused, setPausedState] = useState(pausedState)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const setPaused = (value: boolean | ((p: boolean) => boolean)): void => {
    setPausedState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      pausedState = next
      return next
    })
  }

  useEffect(() => {
    window.obscure.getEventLog().then((initial) => setEntries([...initial].reverse()))
    return window.obscure.onEventLogEntry((entry) => {
      if (pausedRef.current) return
      setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES))
    })
  }, [])

  const clear = async (): Promise<void> => {
    await window.obscure.clearEventLog()
    setEntries([])
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.eventLog.title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)}>
          {paused ? t.eventLog.resume : t.eventLog.pause}
        </Button>
        <Button variant="outline" size="sm" onClick={clear} disabled={entries.length === 0}>
          {t.eventLog.clear}
        </Button>
        <span className="text-xs text-muted-foreground">
          {paused ? t.eventLog.statusPaused : t.eventLog.statusLive}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.eventLog.empty}</p>
      ) : (
        <ScrollArea className="h-[32rem] rounded-lg border border-border">
          <ul className="flex flex-col divide-y divide-border">
            {entries.map((entry) => {
              const expanded = expandedId === entry.id
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : entry.id)}
                    className="flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent/50"
                  >
                    <span className="shrink-0 pt-0.5 font-mono text-muted-foreground">{formatTime(entry.timestamp)}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono font-medium">{entry.event}</span>
                    {!expanded && <span className="min-w-0 flex-1 truncate text-muted-foreground">{previewPayload(entry.payload)}</span>}
                  </button>
                  {expanded && (
                    <pre className="overflow-x-auto bg-muted/50 px-3 py-2 text-xs whitespace-pre-wrap">
                      {JSON.stringify(entry.payload, null, 2)}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}
