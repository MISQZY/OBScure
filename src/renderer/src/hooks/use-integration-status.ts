import { useCallback, useEffect, useState } from 'react'
import type { IntegrationKey, IntegrationsStatusMap } from '@shared/types'


export function useIntegrationStatus(key: IntegrationKey): [string, () => void] {
  const [status, setStatus] = useState('disconnected')

  const fetchStatus = useCallback(() => {
    window.obscure.getIntegrationsStatus().then((all) => setStatus(all[key]))
  }, [key])

  useEffect(() => {
    fetchStatus()
    return window.obscure.onIntegrationsStatusUpdate((all) => setStatus(all[key]))
  }, [fetchStatus, key])

  return [status, fetchStatus]
}

/** Full status map, live-updated — see DashboardPage's identical fetch+subscribe pair. Null until the first fetch resolves, same as DashboardPage. */
export function useIntegrationsStatus(): IntegrationsStatusMap | null {
  const [status, setStatus] = useState<IntegrationsStatusMap | null>(null)

  useEffect(() => {
    window.obscure.getIntegrationsStatus().then(setStatus)
    return window.obscure.onIntegrationsStatusUpdate(setStatus)
  }, [])

  return status
}
