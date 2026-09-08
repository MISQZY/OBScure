import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { TwitchChannelStats } from '@shared/types'

const TwitchStatsContext = createContext<TwitchChannelStats | null>(null)

/**
 * Live Twitch channel stats (followers/subscribers/viewers), pushed from the
 * main process every 60s while Twitch is connected (see TwitchIntegration's
 * own pollStats/AppEvents' 'twitch-stats' doc comment) — the editor-preview
 * equivalent of the 'twitch-stats' WS broadcast an actual OBS Browser Source
 * gets over ws://.../ws (see overlays/custom-render.js). Read by a
 * scope='twitch' Variable node (VariableNode.tsx) to show a live value, and
 * by variablePlaceholderValue (components/nodes/utils/constants.ts) to
 * resolve it wherever that node is wired in or registers its placeholder.
 * Null until the first push arrives, and again whenever Twitch disconnects —
 * same "0 for an unresolved value" convention as an unwired Progress Bar
 * socket, resolved downstream in variablePlaceholderValue/platformStatValue.
 */
export function TwitchStatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<TwitchChannelStats | null>(null)

  useEffect(() => {
    let cancelled = false
    window.obscure
      .getTwitchStats()
      .then((result) => {
        if (!cancelled) setStats(result)
      })
      .catch(() => {})
    const unsubscribe = window.obscure.onTwitchStatsUpdate(setStats)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return <TwitchStatsContext.Provider value={stats}>{children}</TwitchStatsContext.Provider>
}

export function useTwitchStats(): TwitchChannelStats | null {
  return useContext(TwitchStatsContext)
}
