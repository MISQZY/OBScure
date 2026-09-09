import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CommandDef } from '@shared/eventsConfig'

interface CommandsContextValue {
  commands: CommandDef[]
  saveCommand: (command: CommandDef) => Promise<void>
  deleteCommand: (id: string) => Promise<void>
}

const CommandsContext = createContext<CommandsContextValue | null>(null)

/**
 * Single source of truth for the registered Commands ("Команды" page),
 * shared by that page, Roulette/Actions' own CommandSelectField, and a
 * Scene's Event(kind: 'command') node — same shape as
 * GlobalVariablesProvider. No IPC push-listener needed for cross-consumer
 * sync: every consumer here lives in this same renderer's React tree, so
 * saveCommand/deleteCommand updating this one piece of state already
 * re-renders all of them (unlike the OBS Browser Source, which only ever
 * sees a command indirectly via the 'command-triggered' WS broadcast — see
 * OverlayServer).
 */
export function CommandsProvider({ children }: { children: ReactNode }) {
  const [commands, setCommands] = useState<CommandDef[]>([])

  useEffect(() => {
    let cancelled = false
    window.obscure
      .getCommands()
      .then((result) => {
        if (!cancelled) setCommands(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const saveCommand = useCallback(async (command: CommandDef): Promise<void> => {
    setCommands(await window.obscure.saveCommand(command))
  }, [])

  const deleteCommand = useCallback(async (id: string): Promise<void> => {
    setCommands(await window.obscure.deleteCommand(id))
  }, [])

  const value = useMemo<CommandsContextValue>(
    () => ({ commands, saveCommand, deleteCommand }),
    [commands, saveCommand, deleteCommand]
  )

  return <CommandsContext.Provider value={value}>{children}</CommandsContext.Provider>
}

export function useCommands(): CommandsContextValue {
  const ctx = useContext(CommandsContext)
  if (!ctx) throw new Error('useCommands must be used within a CommandsProvider')
  return ctx
}
