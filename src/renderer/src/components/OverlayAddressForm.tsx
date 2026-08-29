import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { interpolate } from '@/lib/i18n/interpolate'
import { useI18n } from '@/providers/I18nProvider'
import type { OverlayUrls } from '@shared/types'

interface OverlayAddressFormProps {
  current: OverlayUrls
  onUpdated: (urls: OverlayUrls) => void
}

export function OverlayAddressForm({ current, onUpdated }: OverlayAddressFormProps) {
  const { t } = useI18n()
  const [host, setHost] = useState(current.host)
  const [port, setPort] = useState(String(current.port))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setHost(current.host)
    setPort(String(current.port))
  }, [current.host, current.port])

  const save = async (): Promise<void> => {
    const portNumber = Number(port)
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      setError(t.overlayAddress.portError)
      return
    }

    setPending(true)
    setError(null)
    try {
      const urls = await window.maddoner.updateOverlayAddress({ host, port: portNumber })
      onUpdated(urls)
    } catch {
      setError(t.overlayAddress.restartError)
    } finally {
      setPending(false)
    }
  }

  const isLoopback = host === '127.0.0.1' || host === 'localhost'

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="overlay-host">{t.common.host}</Label>
          <Input id="overlay-host" value={host} onChange={(event) => setHost(event.target.value)} />
        </div>
        <div className="flex w-24 flex-col gap-1">
          <Label htmlFor="overlay-port">{t.common.port}</Label>
          <Input id="overlay-port" value={port} onChange={(event) => setPort(event.target.value)} />
        </div>
        <Button onClick={save} disabled={pending}>
          {pending ? t.overlayAddress.restarting : t.common.save}
        </Button>
      </div>
      {!isLoopback && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {interpolate(t.overlayAddress.lanWarning, { host })}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
