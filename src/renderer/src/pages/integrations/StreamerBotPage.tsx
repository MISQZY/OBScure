import { ConnectButton } from '@/components/ConnectButton'
import { IntegrationPageLayout } from '@/components/layout/IntegrationPageLayout'
import { SettingTextField } from '@/components/SettingTextField'
import { useIntegrationStatus } from '@/hooks/use-integration-status'
import { useI18n } from '@/providers/I18nProvider'

export function StreamerBotPage() {
  const { t } = useI18n()
  const [status, refresh] = useIntegrationStatus('streamerbot')

  return (
    <IntegrationPageLayout title="Streamer.bot" status={status} description={t.integrations.streamerbot.description}>
      <p className="text-xs text-muted-foreground">{t.integrations.streamerbot.setupNote}</p>
      <SettingTextField
        settingKey="streamerbot.host"
        label={t.common.host}
        placeholder="127.0.0.1"
      />
      <SettingTextField
        settingKey="streamerbot.port"
        label={t.common.port}
        placeholder="8080"
      />
      <SettingTextField
        settingKey="streamerbot.endpoint"
        label={t.integrations.streamerbot.endpointLabel}
        placeholder="/"
      />
      <SettingTextField
        settingKey="streamerbot.password"
        label={t.integrations.streamerbot.passwordLabel}
        placeholder={t.integrations.streamerbot.passwordPlaceholder}
        type="password"
      />
      <ConnectButton integrationKey="streamerbot" status={status} onChanged={refresh} variant="local" />
    </IntegrationPageLayout>
  )
}
