import { useEffect, useState } from 'react'
import { Eye, Heart, Music2, Users } from 'lucide-react'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { INTEGRATION_KEYS, INTEGRATIONS_META } from '@/lib/integrations-meta'
import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/I18nProvider'
import type { IntegrationsStatusMap, NowPlayingPayload, TwitchChannelStats } from '@shared/types'

/** Twitch's live status can flip and its stats drift while the dashboard sits open, so keep them fresh without a manual refresh. */
const TWITCH_STATS_POLL_MS = 60_000

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/**
 * The host's local wall-clock time for `date`. Deliberately not
 * `toLocaleTimeString()` — that goes through Intl, which depends on full ICU
 * timezone data being available and has shown up rendering in UTC instead of
 * the system's zone. getHours()/getMinutes() are local time by spec
 * regardless of any ICU data, so they can't have the same failure mode.
 */
function formatLocalTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Live "stream has been running for" counter, same H:MM:SS shape as the roulette countdown (RouletteToolPage.tsx). */
function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

export function DashboardPage() {
  const { t } = useI18n()
  const [status, setStatus] = useState<IntegrationsStatusMap | null>(null)
  const [twitchStats, setTwitchStats] = useState<TwitchChannelStats | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingPayload | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const twitchConnected = status?.twitch === 'connected'
  const nowPlayingAvailable = status?.spotify === 'connected' || status?.windowsMedia === 'connected'
  const hasTrack = Boolean(nowPlaying && (nowPlaying.title || nowPlaying.artist))

  useEffect(() => {
    window.maddoner.getIntegrationsStatus().then(setStatus)
    return window.maddoner.onIntegrationsStatusUpdate(setStatus)
  }, [])

  useEffect(() => {
    window.maddoner.getNowPlaying().then(setNowPlaying)
    return window.maddoner.onNowPlaying(setNowPlaying)
  }, [])

  useEffect(() => {
    if (!twitchConnected) {
      setTwitchStats(null)
      return
    }
    let cancelled = false
    const load = (): void => {
      window.maddoner.getTwitchStats().then((stats) => {
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

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">{t.dashboard.title}</h1>
        <p className="text-sm text-muted-foreground">{t.dashboard.description}</p>
      </div>

      <CollapsibleSection
        title={t.sidebar.integrations}
        level="h2"
        titleClassName="text-sm font-medium"
        className="gap-2"
        tourId="dashboard-integrations"
      >
        <div className="flex gap-3">
          {INTEGRATION_KEYS.map((key) => {
            const { label, icon: Icon } = INTEGRATIONS_META[key]
            const connected = status?.[key] === 'connected'
            return (
              <div
                key={key}
                title={`${label}: ${connected ? t.status.connected : t.status.disconnected}`}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors',
                  connected
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'border-border bg-muted/40 text-muted-foreground'
                )}
              >
                <Icon className="size-5" />
                <span className="text-xs font-medium">{label}</span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t.dashboard.footerNote}</p>
      </CollapsibleSection>

      {nowPlayingAvailable && (
        <CollapsibleSection
          title={t.dashboard.nowPlaying.title}
          level="h2"
          titleClassName="text-sm font-medium"
          className="gap-2"
        >
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background">
              {nowPlaying?.albumArt ? (
                <img
                  key={nowPlaying.albumArt}
                  src={nowPlaying.albumArt}
                  alt=""
                  className="size-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <Music2 className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              {hasTrack && nowPlaying ? (
                <>
                  <p className="truncate text-sm font-medium">{nowPlaying.title || t.dashboard.nowPlaying.unknownTitle}</p>
                  <p className="truncate text-xs text-muted-foreground">{nowPlaying.artist}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t.dashboard.nowPlaying.nothingPlaying}</p>
              )}
            </div>
            {hasTrack && nowPlaying && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                  nowPlaying.isPlaying
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {nowPlaying.isPlaying ? t.dashboard.nowPlaying.playing : t.dashboard.nowPlaying.paused}
              </span>
            )}
          </div>
        </CollapsibleSection>
      )}

      {twitchConnected && (
        <CollapsibleSection
          title={t.dashboard.twitchStats.title}
          level="h2"
          titleClassName="text-sm font-medium"
          className="gap-2"
        >
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {twitchStats?.isLive ? twitchStats.title || t.dashboard.twitchStats.title : t.dashboard.twitchStats.offline}
                </p>
                {twitchStats?.isLive && (
                  <p className="text-xs text-muted-foreground">
                    {twitchStats.gameName || t.dashboard.twitchStats.noCategory}
                    {twitchStats.startedAt &&
                      ` · ${t.dashboard.twitchStats.uptime} ${formatLocalTime(new Date(twitchStats.startedAt))} (${formatElapsed(
                        Math.max(0, Math.floor((now - new Date(twitchStats.startedAt).getTime()) / 1000))
                      )})`}
                  </p>
                )}
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                  twitchStats?.isLive
                    ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {twitchStats?.isLive ? t.dashboard.twitchStats.live : t.dashboard.twitchStats.offline}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <TwitchStatTile
                icon={Eye}
                label={t.dashboard.twitchStats.viewers}
                value={twitchStats?.isLive ? twitchStats.viewerCount : null}
                unavailable={t.dashboard.twitchStats.unavailable}
              />
              <TwitchStatTile
                icon={Heart}
                label={t.dashboard.twitchStats.followers}
                value={twitchStats?.followerCount ?? null}
                unavailable={t.dashboard.twitchStats.unavailable}
              />
              <TwitchStatTile
                icon={Users}
                label={t.dashboard.twitchStats.subscribers}
                value={twitchStats?.subscriberCount ?? null}
                unavailable={t.dashboard.twitchStats.unavailable}
              />
            </div>
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}

interface TwitchStatTileProps {
  icon: typeof Eye
  label: string
  value: number | null
  unavailable: string
}

function TwitchStatTile({ icon: Icon, label, value, unavailable }: TwitchStatTileProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background p-3 text-center">
      <Icon className="size-4 text-muted-foreground" />
      <span className="text-base font-semibold tabular-nums">{value === null ? '—' : value.toLocaleString()}</span>
      <span className="text-xs text-muted-foreground">{value === null ? unavailable : label}</span>
    </div>
  )
}
