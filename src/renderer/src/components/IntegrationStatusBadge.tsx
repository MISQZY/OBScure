import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/I18nProvider'

const STATUS_STYLES: Record<string, string> = {
  connected: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  connecting: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  disconnected: 'bg-muted text-muted-foreground',
  error: 'bg-destructive/15 text-destructive'
}

interface IntegrationStatusBadgeProps {
  status: string
}

export function IntegrationStatusBadge({ status }: IntegrationStatusBadgeProps) {
  const { t } = useI18n()
  const statusLabels: Record<string, string> = {
    connected: t.status.connected,
    connecting: t.status.connecting,
    disconnected: t.status.disconnected,
    error: t.status.error
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_STYLES[status] ?? STATUS_STYLES.disconnected
      )}
    >
      {statusLabels[status] ?? status}
    </span>
  )
}
