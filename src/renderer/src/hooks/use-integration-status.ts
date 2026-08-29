import { useCallback, useEffect, useState } from 'react'
import type { IntegrationKey } from '@shared/types'


export function useIntegrationStatus(key: IntegrationKey): [string, () => void] {
  const [status, setStatus] = useState('disconnected')

  const fetchStatus = useCallback(() => {
    window.maddoner.getIntegrationsStatus().then((all) => setStatus(all[key]))
  }, [key])

  useEffect(() => {
    fetchStatus()
    return window.maddoner.onIntegrationsStatusUpdate((all) => setStatus(all[key]))
  }, [fetchStatus, key])

  return [status, fetchStatus]
}
