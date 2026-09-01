import { useCallback, useEffect, useState } from 'react'
import type { AppUpdaterStatus } from '@shared/types'

export function useAppUpdater(): [AppUpdaterStatus, () => void] {
  const [status, setStatus] = useState<AppUpdaterStatus>({ state: 'idle' })

  useEffect(() => {
    window.maddoner.getUpdaterStatus().then(setStatus)
    return window.maddoner.onUpdaterStatus(setStatus)
  }, [])

  const download = useCallback(() => {
    void window.maddoner.downloadUpdate()
  }, [])

  return [status, download]
}
