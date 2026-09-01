import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/providers/I18nProvider'
import type { IntegrationKey } from '@shared/types'

interface ConnectButtonProps {
  integrationKey: IntegrationKey
  status: string
  onChanged: () => void
}

export function ConnectButton({ integrationKey, status, onChanged }: ConnectButtonProps) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async (): Promise<void> => {
    setPending(true)
    setError(null)
    const result = await window.obscure.connectIntegration(integrationKey)
    setPending(false)
    if (!result.ok) setError(result.error ?? t.connect.genericError)
    onChanged()
  }

  const disconnect = async (): Promise<void> => {
    setPending(true)
    await window.obscure.disconnectIntegration(integrationKey)
    setPending(false)
    onChanged()
  }

  return (
    <div className="flex flex-col gap-1.5" data-tour="connect-button">
      {status === 'connected' ? (
        <Button variant="outline" onClick={disconnect} disabled={pending} className="w-fit">
          {t.connect.disconnect}
        </Button>
      ) : (
        <Button onClick={connect} disabled={pending} className="w-fit">
          {pending ? t.connect.connecting : t.connect.connect}
        </Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
