import { useEffect, useMemo, useRef, useState } from 'react'
import type { DependencyList, RefObject } from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import ReactGridLayout, { WidthProvider } from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GridCard } from '@/components/dashboard/GridCard'
import { IntegrationsCard } from '@/components/dashboard/IntegrationsCard'
import { NowPlayingCard } from '@/components/dashboard/NowPlayingCard'
import { TwitchStatsCard } from '@/components/dashboard/TwitchStatsCard'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ScrollBar } from '@/components/ui/scroll-area'
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

// Deliberately chunky: 12 columns and 64px rows so cards snap to large tiles
// instead of pixel-perfect free placement.
const GRID_COLS = 12
const GRID_ROW_HEIGHT = 64
const GRID_MARGIN: [number, number] = [16, 16]

// react-grid-layout's minW/minH are in grid columns, not pixels — a column
// shrinks along with the whole grid as the window narrows, so that alone
// doesn't stop a card from being squeezed into an unusably thin sliver. This
// floors the grid's own rendered width so columns never get thinner than
// this, and lets it overflow (scroll) instead once the window can't fit it.
const MIN_COL_WIDTH = GRID_ROW_HEIGHT
const MIN_GRID_WIDTH = GRID_COLS * MIN_COL_WIDTH + (GRID_COLS + 1) * GRID_MARGIN[0]

// Matches `main`'s own p-6 in App.tsx, so the grid's floor lines up with the
// page's existing bottom padding instead of adding a second gap under it.
const PAGE_BOTTOM_GAP = 24

interface CardRect {
  x: number
  y: number
  w: number
  h: number
}

const DEFAULT_RECTS: Record<CardId, CardRect> = {
  integrations: { x: 0, y: 0, w: 6, h: 5 },
  nowPlaying: { x: 6, y: 0, w: 6, h: 2 },
  twitchStats: { x: 6, y: 2, w: 6, h: 4 }
}

const MIN_SIZE: Record<CardId, { minW: number; minH: number }> = {
  integrations: { minW: 3, minH: 3 },
  nowPlaying: { minW: 3, minH: 2 },
  twitchStats: { minW: 4, minH: 3 }
}

const LAYOUT_STORAGE_KEY = 'obscure:dashboard-layout-v2'

/** Created once at module scope — recreating it on every render would remount the whole grid. */
const Grid = WidthProvider(ReactGridLayout)

interface DashboardLayout {
  /** Grid rect per card, kept even while hidden so it reappears where it was left. */
  cards: Record<CardId, CardRect>
  /** Cards the user removed via the card's trash button; brought back via the "+" menu. */
  hidden: CardId[]
}

function isCardId(value: unknown): value is CardId {
  return CARD_IDS.includes(value as CardId)
}

function rectsOverlap(a: CardRect, b: CardRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * First non-overlapping spot for a `w`×`h` card, scanning row by row. Used
 * when bringing a hidden card back — its last remembered rect may now
 * collide with whatever the other cards moved into while it was away, and
 * with compactType off nothing auto-resolves that for us.
 */
function findFreeRect(w: number, h: number, occupied: CardRect[]): CardRect {
  for (let y = 0; ; y++) {
    for (let x = 0; x <= GRID_COLS - w; x++) {
      const candidate: CardRect = { x, y, w, h }
      if (!occupied.some((rect) => rectsOverlap(candidate, rect))) return candidate
    }
  }
}

function isCardRect(value: unknown): value is CardRect {
  if (!value || typeof value !== 'object') return false
  const rect = value as Record<string, unknown>
  return typeof rect.x === 'number' && typeof rect.y === 'number' && typeof rect.w === 'number' && typeof rect.h === 'number'
}

/** Purely a display preference, not app state — never blocks on it, always falls back to the default layout. */
function readStoredLayout(): DashboardLayout {
  const cards = { ...DEFAULT_RECTS }
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    const cardsSource = (parsed as { cards?: unknown })?.cards
    const hiddenSource = (parsed as { hidden?: unknown })?.hidden

    if (cardsSource && typeof cardsSource === 'object') {
      for (const id of CARD_IDS) {
        const rect = (cardsSource as Record<string, unknown>)[id]
        if (isCardRect(rect)) cards[id] = rect
      }
    }
    const hidden = Array.isArray(hiddenSource) ? hiddenSource.filter(isCardId) : []
    return { cards, hidden }
  } catch {
    return { cards, hidden: [] }
  }
}

/**
 * Measures how much vertical space is left below `ref`'s element down to the
 * bottom of the window, so the grid canvas can claim all of it up front
 * instead of only ever being as tall as its cards — you'd otherwise have
 * nowhere to drop a card below the current content. A plain pixel min-height
 * (rather than e.g. flex-1) sidesteps the surrounding ScrollArea/main chain
 * not having a definite height to stretch against.
 */
function useAvailableHeight(ref: RefObject<HTMLElement | null>, deps: DependencyList): number | undefined {
  const [minHeight, setMinHeight] = useState<number>()

  useEffect(() => {
    const update = (): void => {
      const el = ref.current
      if (!el) return
      setMinHeight(Math.max(0, window.innerHeight - el.getBoundingClientRect().top - PAGE_BOTTOM_GAP))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return minHeight
}

export function DashboardPage() {
  const { t } = useI18n()
  const [status, setStatus] = useState<IntegrationsStatusMap | null>(null)
  const [twitchStats, setTwitchStats] = useState<TwitchChannelStats | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingPayload | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [layout, setLayout] = useState<DashboardLayout>(() => readStoredLayout())
  const gridAreaRef = useRef<HTMLDivElement>(null)
  const twitchConnected = status?.twitch === 'connected'
  const nowPlayingAvailable = status?.spotify === 'connected' || status?.windowsMedia === 'connected'

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
  const visibleIds = useMemo(
    () => CARD_IDS.filter((id) => available[id] && !layout.hidden.includes(id)),
    [layout, available]
  )
  const removableIds = useMemo(
    () => CARD_IDS.filter((id) => available[id] && layout.hidden.includes(id)),
    [layout, available]
  )

  // The empty-state message shifts the grid's top down when it appears/disappears.
  const minHeight = useAvailableHeight(gridAreaRef, [visibleIds.length])

  const rglLayout: Layout[] = useMemo(
    () => visibleIds.map((id) => ({ i: id, ...layout.cards[id], ...MIN_SIZE[id] })),
    [visibleIds, layout.cards]
  )

  function handleLayoutChange(newLayout: Layout[]): void {
    setLayout((prev) => {
      const cards = { ...prev.cards }
      for (const item of newLayout) {
        if (isCardId(item.i)) {
          cards[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h }
        }
      }
      return { ...prev, cards }
    })
  }

  function handleRemove(id: CardId): void {
    setLayout((prev) => (prev.hidden.includes(id) ? prev : { ...prev, hidden: [...prev.hidden, id] }))
  }

  function handleAdd(id: CardId): void {
    setLayout((prev) => {
      const rect = prev.cards[id]
      const occupied = visibleIds.filter((otherId) => otherId !== id).map((otherId) => prev.cards[otherId])
      const cards = occupied.some((other) => rectsOverlap(rect, other))
        ? { ...prev.cards, [id]: findFreeRect(rect.w, rect.h, occupied) }
        : prev.cards
      return { ...prev, cards, hidden: prev.hidden.filter((hiddenId) => hiddenId !== id) }
    })
  }

  function renderCard(id: CardId) {
    switch (id) {
      case 'integrations':
        return <IntegrationsCard status={status} onRemove={() => handleRemove(id)} />
      case 'nowPlaying':
        return <NowPlayingCard nowPlaying={nowPlaying} onRemove={() => handleRemove(id)} />
      case 'twitchStats':
        return <TwitchStatsCard twitchStats={twitchStats} now={now} onRemove={() => handleRemove(id)} />
    }
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

      {visibleIds.length === 0 && <p className="text-sm text-muted-foreground">{t.dashboard.noCards}</p>}

      {/*
        minHeight lives on this plain wrapper, not on the ScrollArea below —
        putting it on the ScrollArea itself would stretch that box (and drag
        its horizontal scrollbar, anchored to its own bottom edge) down to
        the bottom of the whole reserved canvas, far past the actual cards.
        Left alone here, the ScrollArea hugs the grid's real height and any
        leftover minHeight just becomes plain unscrollable blank canvas below it.
      */}
      <div ref={gridAreaRef} style={{ minHeight }}>
        <ScrollAreaPrimitive.Root type="auto" className="overflow-hidden">
          <ScrollAreaPrimitive.Viewport className="w-full rounded-[inherit] [&>div]:!block">
            <Grid
              cols={GRID_COLS}
              rowHeight={GRID_ROW_HEIGHT}
              margin={GRID_MARGIN}
              containerPadding={[0, 0]}
              layout={rglLayout}
              onLayoutChange={handleLayoutChange}
              draggableHandle=".dashboard-drag-handle"
              compactType={null}
              preventCollision
              useCSSTransforms
              style={{ minWidth: MIN_GRID_WIDTH }}
            >
              {visibleIds.map((id) => (
                <GridCard key={id}>{renderCard(id)}</GridCard>
              ))}
            </Grid>
          </ScrollAreaPrimitive.Viewport>
          <ScrollBar orientation="horizontal" />
        </ScrollAreaPrimitive.Root>
      </div>
    </div>
  )
}
