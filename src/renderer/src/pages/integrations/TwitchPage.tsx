import { ConnectButton } from '@/components/ConnectButton'
import { IntegrationPageLayout } from '@/components/layout/IntegrationPageLayout'
import { SettingTextField } from '@/components/SettingTextField'
import { SetupSteps } from '@/components/SetupSteps'
import { useIntegrationStatus } from '@/hooks/use-integration-status'
import { useI18n } from '@/providers/I18nProvider'

export function TwitchPage() {
  const { t } = useI18n()
  const [status, refresh] = useIntegrationStatus('twitch')

  return (
    <IntegrationPageLayout title="Twitch" status={status} description={t.integrations.twitch.description}>
      <p className="text-xs text-muted-foreground">{t.integrations.twitch.setupNote}</p>
      <SetupSteps steps={t.integrations.twitch.setupSteps} />
      <SettingTextField
        settingKey="twitch.clientId"
        label={t.integrations.twitch.clientIdLabel}
        placeholder={t.integrations.twitch.clientIdPlaceholder}
      />
      <ConnectButton integrationKey="twitch" status={status} onChanged={refresh} />
    </IntegrationPageLayout>
  )
}
