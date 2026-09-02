import { useEffect, useState } from 'react'
import type { WhatsNewPayload } from '@shared/types'

/** Fetches once per app launch — main resolves it lazily, after any GitHub release-notes fetch completes (see src/main/whatsNew.ts). */
export function useWhatsNew(): WhatsNewPayload | null {
  const [payload, setPayload] = useState<WhatsNewPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    window.obscure.getWhatsNew().then((result) => {
      if (!cancelled) setPayload(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return payload
}
