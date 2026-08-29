import { ConnectButton } from '@/components/ConnectButton'
import { IntegrationPageLayout } from '@/components/layout/IntegrationPageLayout'
import { SettingTextField } from '@/components/SettingTextField'
import { useIntegrationStatus } from '@/hooks/use-integration-status'
import { useI18n } from '@/providers/I18nProvider'

export function SpotifyPage() {
  const { t } = useI18n()
  const [status, refresh] = useIntegrationStatus('spotify')

  return (
    <IntegrationPageLayout title="Spotify" status={status} description={t.integrations.spotify.description}>
      <SettingTextField
        settingKey="spotify.clientId"
        label={t.integrations.spotify.clientIdLabel}
        placeholder={t.integrations.spotify.clientIdPlaceholder}
        description={t.integrations.spotify.clientIdDescription}
      />
      <ConnectButton integrationKey="spotify" status={status} onChanged={refresh} />
    </IntegrationPageLayout>
  )
}
