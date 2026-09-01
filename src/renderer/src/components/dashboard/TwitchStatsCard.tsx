import type { ReactNode } from 'react'
import { Eye, Heart, Users } from 'lucide-react'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { CardControls } from '@/components/dashboard/CardControls'
import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/I18nProvider'
import type { TwitchChannelStats } from '@shared/types'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/** The host's local wall-clock time for `date` — see DashboardPage for why this avoids Intl. */
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

interface TwitchStatsCardProps {
  twitchStats: TwitchChannelStats | null
  now: number
  dragHandle: ReactNode
  onRemove: () => void
}

export function TwitchStatsCard({ twitchStats, now, dragHandle, onRemove }: TwitchStatsCardProps) {
  const { t } = useI18n()

  return (
    <CollapsibleSection
      title={t.dashboard.twitchStats.title}
      level="h2"
      titleClassName="text-sm font-medium"
      className="gap-2"
      headerExtra={<CardControls dragHandle={dragHandle} onRemove={onRemove} />}
      indentContent={false}
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
              twitchStats?.isLive ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-muted text-muted-foreground'
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
