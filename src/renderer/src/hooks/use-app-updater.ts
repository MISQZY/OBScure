import { useCallback, useEffect, useState } from 'react'
import type { AppUpdaterStatus } from '@shared/types'

export function useAppUpdater(): [AppUpdaterStatus, () => void] {
  const [status, setStatus] = useState<AppUpdaterStatus>({ state: 'idle' })

  useEffect(() => {
    window.obscure.getUpdaterStatus().then(setStatus).catch(() => setStatus({ state: 'idle' }))
    return window.obscure.onUpdaterStatus(setStatus)
  }, [])

  const download = useCallback(() => {
    void window.obscure.downloadUpdate()
  }, [])

  return [status, download]
}
