import { Music2 } from 'lucide-react'
import { CardControls } from '@/components/dashboard/CardControls'
import { DashboardCardSection } from '@/components/dashboard/DashboardCardSection'
import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/I18nProvider'
import type { NowPlayingPayload } from '@shared/types'

interface NowPlayingCardProps {
  nowPlaying: NowPlayingPayload | null
  onRemove: () => void
}

export function NowPlayingCard({ nowPlaying, onRemove }: NowPlayingCardProps) {
  const { t } = useI18n()
  const hasTrack = Boolean(nowPlaying && (nowPlaying.title || nowPlaying.artist))

  return (
    <DashboardCardSection title={t.dashboard.nowPlaying.title} headerExtra={<CardControls onRemove={onRemove} />}>
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
    </DashboardCardSection>
  )
}
