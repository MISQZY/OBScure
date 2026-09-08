import { IntegrationPageLayout } from '@/components/layout/IntegrationPageLayout'
import { SettingToggleField } from '@/components/SettingToggleField'
import { useIntegrationStatus } from '@/hooks/use-integration-status'
import { useI18n } from '@/providers/I18nProvider'

export function WindowsMediaPage() {
  const { t } = useI18n()
  const [status] = useIntegrationStatus('windowsMedia')

  return (
    <IntegrationPageLayout
      title={t.integrations.windowsMedia.title}
      status={status}
      description={t.integrations.windowsMedia.description}
    >
      <SettingToggleField
        settingKey="windowsMedia.enabled"
        label={t.integrations.windowsMedia.enableLabel}
        description={t.integrations.windowsMedia.enableDescription}
      />
    </IntegrationPageLayout>
  )
}
