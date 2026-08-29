import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { CustomOverlay } from '@shared/types'

interface CustomOverlaysContextValue {
  overlays: CustomOverlay[]
  saveOverlay: (overlay: CustomOverlay) => Promise<void>
  deleteOverlay: (id: string) => Promise<void>
  /** Live-previews a scene (including unsaved edits) in any connected Browser Source without persisting it — see window.maddoner.testCustomOverlay. */
  testOverlay: (overlay: CustomOverlay) => Promise<void>
}

const CustomOverlaysContext = createContext<CustomOverlaysContextValue | null>(null)

/**
 * Single source of truth for custom scenes, shared by the sidebar and the
 * scene builder page. Each used to run its own `useState` over the same
 * settings key — saving in one didn't refresh the other's list, so a newly
 * created scene navigated to before its own fetch resolved would never
 * appear. Lifting the state here means both consumers re-render off the same
 * array as soon as main process confirms the write.
 */
export function CustomOverlaysProvider({ children }: { children: ReactNode }) {
  const [overlays, setOverlays] = useState<CustomOverlay[]>([])

  useEffect(() => {
    window.maddoner.getCustomOverlays().then(setOverlays)
  }, [])

  const saveOverlay = async (overlay: CustomOverlay): Promise<void> => {
    setOverlays(await window.maddoner.saveCustomOverlay(overlay))
  }

  const deleteOverlay = async (id: string): Promise<void> => {
    setOverlays(await window.maddoner.deleteCustomOverlay(id))
  }

  const testOverlay = async (overlay: CustomOverlay): Promise<void> => {
    await window.maddoner.testCustomOverlay(overlay)
  }

  return (
    <CustomOverlaysContext.Provider value={{ overlays, saveOverlay, deleteOverlay, testOverlay }}>
      {children}
    </CustomOverlaysContext.Provider>
  )
}

export function useCustomOverlays(): CustomOverlaysContextValue {
  const ctx = useContext(CustomOverlaysContext)
  if (!ctx) throw new Error('useCustomOverlays must be used within a CustomOverlaysProvider')
  return ctx
}
