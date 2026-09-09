import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { StreamerBotGlobalVariable } from '@shared/types'

const StreamerBotVariablesContext = createContext<StreamerBotGlobalVariable[]>([])

/**
 * Live Streamer.bot global variables, pushed from the main process every 5s
 * while Streamer.bot is connected (see StreamerBotIntegration's own
 * pollGlobals/AppEvents' 'streamerbot-globals' doc comment) — the
 * editor-preview equivalent of the 'streamerbot-globals' WS broadcast an
 * actual OBS Browser Source gets over ws://.../ws (see
 * overlays/custom-render.js). Read by a scope='integration',
 * integration='streamerbot' Variable node (VariableNode.tsx) to show a live
 * value, same role TwitchStatsProvider plays for the platform integrations.
 * Empty until the first push arrives, and again whenever Streamer.bot
 * disconnects.
 */
export function StreamerBotVariablesProvider({ children }: { children: ReactNode }) {
  const [variables, setVariables] = useState<StreamerBotGlobalVariable[]>([])

  useEffect(() => {
    let cancelled = false
    window.obscure
      .getStreamerBotGlobals()
      .then((result) => {
        if (!cancelled) setVariables(result)
      })
      .catch(() => {})
    const unsubscribe = window.obscure.onStreamerBotGlobalsUpdate(setVariables)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return <StreamerBotVariablesContext.Provider value={variables}>{children}</StreamerBotVariablesContext.Provider>
}

export function useStreamerBotVariables(): StreamerBotGlobalVariable[] {
  return useContext(StreamerBotVariablesContext)
}
