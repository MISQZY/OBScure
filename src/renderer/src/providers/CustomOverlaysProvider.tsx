import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CustomOverlay, OverlayFolder } from '@shared/types'

interface CustomOverlaysContextValue {
  overlays: CustomOverlay[]
  saveOverlay: (overlay: CustomOverlay) => Promise<void>
  deleteOverlay: (id: string) => Promise<void>
  /** Live-previews a scene (including unsaved edits) in any connected Browser Source without persisting it — see window.obscure.testCustomOverlay. */
  testOverlay: (overlay: CustomOverlay) => Promise<void>
  folders: OverlayFolder[]
  saveFolder: (folder: OverlayFolder) => Promise<void>
  /** Deletes the folder only — its overlays are ungrouped (folderId cleared) by the main process, never deleted. */
  deleteFolder: (id: string) => Promise<void>
  /** Moves an overlay into `folderId`, or to the top level (ungrouped) when omitted. */
  moveOverlayToFolder: (overlayId: string, folderId: string | undefined) => Promise<void>
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
  const [folders, setFolders] = useState<OverlayFolder[]>([])

  useEffect(() => {
    let cancelled = false
    window.obscure
      .getCustomOverlays()
      .then((result) => {
        if (!cancelled) setOverlays(result)
      })
      .catch(() => {})
    window.obscure
      .getCustomOverlayFolders()
      .then((result) => {
        if (!cancelled) setFolders(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const saveOverlay = useCallback(async (overlay: CustomOverlay): Promise<void> => {
    setOverlays(await window.obscure.saveCustomOverlay(overlay))
  }, [])

  const deleteOverlay = useCallback(async (id: string): Promise<void> => {
    setOverlays(await window.obscure.deleteCustomOverlay(id))
  }, [])

  const testOverlay = useCallback(async (overlay: CustomOverlay): Promise<void> => {
    await window.obscure.testCustomOverlay(overlay)
  }, [])

  const saveFolder = useCallback(async (folder: OverlayFolder): Promise<void> => {
    setFolders(await window.obscure.saveCustomOverlayFolder(folder))
  }, [])

  const deleteFolder = useCallback(async (id: string): Promise<void> => {
    setFolders(await window.obscure.deleteCustomOverlayFolder(id))
    setOverlays((current) =>
      current.map((o) => (o.folderId === id ? { ...o, folderId: undefined } : o))
    )
  }, [])

  const moveOverlayToFolder = useCallback(async (overlayId: string, folderId: string | undefined): Promise<void> => {
    const overlay = overlays.find((o) => o.id === overlayId)
    if (!overlay || overlay.folderId === folderId) return
    await saveOverlay({ ...overlay, folderId })
  }, [overlays, saveOverlay])

  const value = useMemo<CustomOverlaysContextValue>(
    () => ({ overlays, saveOverlay, deleteOverlay, testOverlay, folders, saveFolder, deleteFolder, moveOverlayToFolder }),
    [overlays, saveOverlay, deleteOverlay, testOverlay, folders, saveFolder, deleteFolder, moveOverlayToFolder]
  )

  return <CustomOverlaysContext.Provider value={value}>{children}</CustomOverlaysContext.Provider>
}

export function useCustomOverlays(): CustomOverlaysContextValue {
  const ctx = useContext(CustomOverlaysContext)
  if (!ctx) throw new Error('useCustomOverlays must be used within a CustomOverlaysProvider')
  return ctx
}
