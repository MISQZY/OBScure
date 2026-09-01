import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IntegrationsCard } from '@/components/dashboard/IntegrationsCard'
import { NowPlayingCard } from '@/components/dashboard/NowPlayingCard'
import { SortableCard } from '@/components/dashboard/SortableCard'
import { TwitchStatsCard } from '@/components/dashboard/TwitchStatsCard'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { Dictionary } from '@/lib/i18n/types'
import { useI18n } from '@/providers/I18nProvider'
import type { IntegrationsStatusMap, NowPlayingPayload, TwitchChannelStats } from '@shared/types'

/** Twitch's live status can flip and its stats drift while the dashboard sits open, so keep them fresh without a manual refresh. */
const TWITCH_STATS_POLL_MS = 60_000

const CARD_IDS = ['integrations', 'nowPlaying', 'twitchStats'] as const
type CardId = (typeof CARD_IDS)[number]

const CARD_TITLES: Record<CardId, (t: Dictionary) => string> = {
  integrations: (t) => t.sidebar.integrations,
  nowPlaying: (t) => t.dashboard.nowPlaying.title,
  twitchStats: (t) => t.dashboard.twitchStats.title
}

const LAYOUT_STORAGE_KEY = 'obscure:dashboard-layout'

interface DashboardLayout {
  /** Card order the user dragged into place. */
  order: CardId[]
  /** Cards the user removed via the card's trash button; brought back via the "+" menu. */
  hidden: CardId[]
}

function isCardId(value: unknown): value is CardId {
  return CARD_IDS.includes(value as CardId)
}

/** Purely a display preference, not app state — never blocks on it, always falls back to the default layout. */
function readStoredLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null

    // Legacy shape: a bare order array, from before cards could be hidden.
    const orderSource = Array.isArray(parsed) ? parsed : (parsed as { order?: unknown })?.order
    const hiddenSource = Array.isArray(parsed) ? [] : (parsed as { hidden?: unknown })?.hidden

    const knownOrder = Array.isArray(orderSource) ? orderSource.filter(isCardId) : []
    const missing = CARD_IDS.filter((id) => !knownOrder.includes(id))
    const hidden = Array.isArray(hiddenSource) ? hiddenSource.filter(isCardId) : []

    return { order: [...knownOrder, ...missing], hidden }
  } catch {
    return { order: [...CARD_IDS], hidden: [] }
  }
}

export function DashboardPage() {
  const { t } = useI18n()
  const [status, setStatus] = useState<IntegrationsStatusMap | null>(null)
  const [twitchStats, setTwitchStats] = useState<TwitchChannelStats | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingPayload | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [layout, setLayout] = useState<DashboardLayout>(() => readStoredLayout())
  const twitchConnected = status?.twitch === 'connected'
  const nowPlayingAvailable = status?.spotify === 'connected' || status?.windowsMedia === 'connected'

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    window.obscure.getIntegrationsStatus().then(setStatus)
    return window.obscure.onIntegrationsStatusUpdate(setStatus)
  }, [])

  useEffect(() => {
    window.obscure.getNowPlaying().then(setNowPlaying)
    return window.obscure.onNowPlaying(setNowPlaying)
  }, [])

  useEffect(() => {
    if (!twitchConnected) {
      setTwitchStats(null)
      return
    }
    let cancelled = false
    const load = (): void => {
      window.obscure.getTwitchStats().then((stats) => {
        if (!cancelled) setTwitchStats(stats)
      })
    }
    load()
    const interval = setInterval(load, TWITCH_STATS_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [twitchConnected])

  // Separate from the stats poll above (which only needs to hit Twitch once a
  // minute): the elapsed-time counter should tick every second on its own,
  // purely client-side, off the already-known startedAt.
  useEffect(() => {
    if (!twitchStats?.isLive || !twitchStats.startedAt) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [twitchStats?.isLive, twitchStats?.startedAt])

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
    } catch {
      // Layout just won't persist across restarts in this environment (e.g. private storage disabled).
    }
  }, [layout])

  // A card only really exists once its integration is connected — hiding it is a user choice layered on top of that.
  const available = useMemo<Record<CardId, boolean>>(
    () => ({
      integrations: true,
      nowPlaying: nowPlayingAvailable,
      twitchStats: twitchConnected
    }),
    [nowPlayingAvailable, twitchConnected]
  )
  const visibleOrder = useMemo(
    () => layout.order.filter((id) => available[id] && !layout.hidden.includes(id)),
    [layout, available]
  )
  const removableIds = useMemo(
    () => layout.order.filter((id) => available[id] && layout.hidden.includes(id)),
    [layout, available]
  )

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLayout((prev) => {
      const visible = prev.order.filter((id) => available[id] && !prev.hidden.includes(id))
      const rest = prev.order.filter((id) => !visible.includes(id))
      const oldIndex = visible.indexOf(active.id as CardId)
      const newIndex = visible.indexOf(over.id as CardId)
      if (oldIndex === -1 || newIndex === -1) return prev
      return { ...prev, order: [...arrayMove(visible, oldIndex, newIndex), ...rest] }
    })
  }

  function handleRemove(id: CardId): void {
    setLayout((prev) => (prev.hidden.includes(id) ? prev : { ...prev, hidden: [...prev.hidden, id] }))
  }

  function handleAdd(id: CardId): void {
    setLayout((prev) => ({ ...prev, hidden: prev.hidden.filter((hiddenId) => hiddenId !== id) }))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.dashboard.title}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={removableIds.length === 0}
              aria-label={t.dashboard.addCard}
              title={t.dashboard.addCard}
            >
              <Plus className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {removableIds.map((id) => (
              <DropdownMenuItem key={id} onSelect={() => handleAdd(id)}>
                {CARD_TITLES[id](t)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {visibleOrder.length === 0 && <p className="text-sm text-muted-foreground">{t.dashboard.noCards}</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleOrder} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-4">
            {visibleOrder.map((id) => (
              <SortableCard key={id} id={id} dragHandleLabel={t.dashboard.dragHandle}>
                {(dragHandle) => {
                  switch (id) {
                    case 'integrations':
                      return <IntegrationsCard status={status} dragHandle={dragHandle} onRemove={() => handleRemove(id)} />
                    case 'nowPlaying':
                      return (
                        <NowPlayingCard nowPlaying={nowPlaying} dragHandle={dragHandle} onRemove={() => handleRemove(id)} />
                      )
                    case 'twitchStats':
                      return (
                        <TwitchStatsCard
                          twitchStats={twitchStats}
                          now={now}
                          dragHandle={dragHandle}
                          onRemove={() => handleRemove(id)}
                        />
                      )
                  }
                }}
              </SortableCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
