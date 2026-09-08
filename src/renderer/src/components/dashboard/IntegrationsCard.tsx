import { CardControls } from '@/components/dashboard/CardControls'
import { DashboardCardSection } from '@/components/dashboard/DashboardCardSection'
import { INTEGRATION_KEYS, INTEGRATIONS_META } from '@/lib/integrations-meta'
import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/I18nProvider'
import type { IntegrationsStatusMap } from '@shared/types'

interface IntegrationsCardProps {
  status: IntegrationsStatusMap | null
  onRemove: () => void
}

export function IntegrationsCard({ status, onRemove }: IntegrationsCardProps) {
  const { t } = useI18n()

  return (
    <DashboardCardSection
      title={t.sidebar.integrations}
      tourId="dashboard-integrations"
      headerExtra={<CardControls onRemove={onRemove} />}
    >
      <div className="flex flex-wrap gap-3">
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
    </DashboardCardSection>
  )
}
