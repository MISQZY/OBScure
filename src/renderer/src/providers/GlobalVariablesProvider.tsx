import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { GlobalVariable } from '@shared/types'

interface GlobalVariablesContextValue {
  variables: GlobalVariable[]
  saveVariable: (variable: GlobalVariable) => Promise<void>
  deleteVariable: (id: string) => Promise<void>
}

const GlobalVariablesContext = createContext<GlobalVariablesContextValue | null>(null)

/**
 * Single source of truth for registered global variables ("Данные →
 * Переменные" page), shared by that page, the sidebar, and every Variable
 * node's own scope=global picker (see VariableNode.tsx) — same shape as
 * CustomOverlaysProvider. No IPC push-listener needed for cross-consumer
 * sync (unlike the OBS Browser Source, which is a separate page reached only
 * over WebSocket — see OverlayServer.setGlobalVariables): every consumer
 * here lives in this same renderer's React tree, so saveVariable/deleteVariable
 * updating this one piece of state already re-renders all of them.
 */
export function GlobalVariablesProvider({ children }: { children: ReactNode }) {
  const [variables, setVariables] = useState<GlobalVariable[]>([])

  useEffect(() => {
    let cancelled = false
    window.obscure
      .getGlobalVariables()
      .then((result) => {
        if (!cancelled) setVariables(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const saveVariable = useCallback(async (variable: GlobalVariable): Promise<void> => {
    setVariables(await window.obscure.saveGlobalVariable(variable))
  }, [])

  const deleteVariable = useCallback(async (id: string): Promise<void> => {
    setVariables(await window.obscure.deleteGlobalVariable(id))
  }, [])

  const value = useMemo<GlobalVariablesContextValue>(
    () => ({ variables, saveVariable, deleteVariable }),
    [variables, saveVariable, deleteVariable]
  )

  return <GlobalVariablesContext.Provider value={value}>{children}</GlobalVariablesContext.Provider>
}

export function useGlobalVariables(): GlobalVariablesContextValue {
  const ctx = useContext(GlobalVariablesContext)
  if (!ctx) throw new Error('useGlobalVariables must be used within a GlobalVariablesProvider')
  return ctx
}
