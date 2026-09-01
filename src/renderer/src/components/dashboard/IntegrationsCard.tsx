import type { ReactNode } from 'react'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { CardControls } from '@/components/dashboard/CardControls'
import { INTEGRATION_KEYS, INTEGRATIONS_META } from '@/lib/integrations-meta'
import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/I18nProvider'
import type { IntegrationsStatusMap } from '@shared/types'

interface IntegrationsCardProps {
  status: IntegrationsStatusMap | null
  dragHandle: ReactNode
  onRemove: () => void
}

export function IntegrationsCard({ status, dragHandle, onRemove }: IntegrationsCardProps) {
  const { t } = useI18n()

  return (
    <CollapsibleSection
      title={t.sidebar.integrations}
      level="h2"
      titleClassName="text-sm font-medium"
      className="gap-2"
      tourId="dashboard-integrations"
      headerExtra={<CardControls dragHandle={dragHandle} onRemove={onRemove} />}
      indentContent={false}
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
      <p className="text-xs text-muted-foreground">{t.dashboard.footerNote}</p>
    </CollapsibleSection>
  )
}
