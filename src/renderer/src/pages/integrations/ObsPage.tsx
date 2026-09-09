import { ConnectButton } from '@/components/ConnectButton'
import { IntegrationPageLayout } from '@/components/layout/IntegrationPageLayout'
import { SettingTextField } from '@/components/SettingTextField'
import { useIntegrationStatus } from '@/hooks/use-integration-status'
import { INTEGRATIONS_META } from '@/lib/integrations-meta'
import { useI18n } from '@/providers/I18nProvider'

export function ObsPage() {
  const { t } = useI18n()
  const [status, refresh] = useIntegrationStatus('obs')

  return (
    <IntegrationPageLayout
      title="OBS"
      icon={INTEGRATIONS_META.obs.icon}
      status={status}
      description={t.integrations.obs.description}
    >
      <p className="text-xs text-muted-foreground">{t.integrations.obs.setupNote}</p>
      <SettingTextField settingKey="obs.host" label={t.common.host} placeholder="127.0.0.1" />
      <SettingTextField settingKey="obs.port" label={t.common.port} placeholder="4455" />
      <SettingTextField
        settingKey="obs.password"
        label={t.integrations.obs.passwordLabel}
        placeholder={t.integrations.obs.passwordPlaceholder}
        type="password"
      />
      <ConnectButton integrationKey="obs" status={status} onChanged={refresh} variant="local" />
    </IntegrationPageLayout>
  )
}
