import { ConnectButton } from '@/components/ConnectButton'
import { IntegrationPageLayout } from '@/components/layout/IntegrationPageLayout'
import { SettingTextField } from '@/components/SettingTextField'
import { SetupSteps } from '@/components/SetupSteps'
import { useIntegrationStatus } from '@/hooks/use-integration-status'
import { useI18n } from '@/providers/I18nProvider'

export function YoutubePage() {
  const { t } = useI18n()
  const [status, refresh] = useIntegrationStatus('youtube')

  return (
    <IntegrationPageLayout title="YouTube" status={status} description={t.integrations.youtube.description}>
      <SetupSteps steps={t.integrations.youtube.setupSteps} />
      <SettingTextField
        settingKey="youtube.clientId"
        label={t.integrations.youtube.clientIdLabel}
        placeholder={t.integrations.youtube.clientIdPlaceholder}
      />
      <SettingTextField
        settingKey="youtube.clientSecret"
        label={t.integrations.youtube.clientSecretLabel}
        type="password"
        placeholder={t.integrations.youtube.clientSecretPlaceholder}
      />
      <ConnectButton integrationKey="youtube" status={status} onChanged={refresh} />
    </IntegrationPageLayout>
  )
}
