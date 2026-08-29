import { ConnectButton } from '@/components/ConnectButton'
import { IntegrationPageLayout } from '@/components/layout/IntegrationPageLayout'
import { SettingTextField } from '@/components/SettingTextField'
import { useIntegrationStatus } from '@/hooks/use-integration-status'
import { useI18n } from '@/providers/I18nProvider'

export function TwitchPage() {
  const { t } = useI18n()
  const [status, refresh] = useIntegrationStatus('twitch')

  return (
    <IntegrationPageLayout title="Twitch" status={status} description={t.integrations.twitch.description}>
      <SettingTextField
        settingKey="twitch.clientId"
        label={t.integrations.twitch.clientIdLabel}
        placeholder={t.integrations.twitch.clientIdPlaceholder}
        description={t.integrations.twitch.clientIdDescription}
      />
      <ConnectButton integrationKey="twitch" status={status} onChanged={refresh} />
    </IntegrationPageLayout>
  )
}
