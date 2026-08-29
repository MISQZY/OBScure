import { ConnectButton } from '@/components/ConnectButton'
import { IntegrationPageLayout } from '@/components/layout/IntegrationPageLayout'
import { SettingTextField } from '@/components/SettingTextField'
import { useIntegrationStatus } from '@/hooks/use-integration-status'
import { useI18n } from '@/providers/I18nProvider'

export function YoutubePage() {
  const { t } = useI18n()
  const [status, refresh] = useIntegrationStatus('youtube')

  return (
    <IntegrationPageLayout title="YouTube" status={status} description={t.integrations.youtube.description}>
      <SettingTextField
        settingKey="youtube.clientId"
        label={t.integrations.youtube.clientIdLabel}
        placeholder={t.integrations.youtube.clientIdPlaceholder}
        description={t.integrations.youtube.clientIdDescription}
      />
      <SettingTextField
        settingKey="youtube.clientSecret"
        label={t.integrations.youtube.clientSecretLabel}
        type="password"
        placeholder={t.integrations.youtube.clientSecretPlaceholder}
        description={t.integrations.youtube.clientSecretDescription}
      />
      <ConnectButton integrationKey="youtube" status={status} onChanged={refresh} />
    </IntegrationPageLayout>
  )
}
