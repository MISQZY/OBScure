import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { CustomOverlay, OverlayFolder } from '@shared/types'

interface CustomOverlaysContextValue {
  overlays: CustomOverlay[]
  saveOverlay: (overlay: CustomOverlay) => Promise<void>
  deleteOverlay: (id: string) => Promise<void>
  /** Live-previews a scene (including unsaved edits) in any connected Browser Source without persisting it — see window.maddoner.testCustomOverlay. */
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
    window.maddoner.getCustomOverlays().then(setOverlays)
    window.maddoner.getCustomOverlayFolders().then(setFolders)
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

  const saveFolder = async (folder: OverlayFolder): Promise<void> => {
    setFolders(await window.maddoner.saveCustomOverlayFolder(folder))
  }

  const deleteFolder = async (id: string): Promise<void> => {
    setFolders(await window.maddoner.deleteCustomOverlayFolder(id))
    setOverlays((current) =>
      current.map((o) => (o.folderId === id ? { ...o, folderId: undefined } : o))
    )
  }

  const moveOverlayToFolder = async (overlayId: string, folderId: string | undefined): Promise<void> => {
    const overlay = overlays.find((o) => o.id === overlayId)
    if (!overlay || overlay.folderId === folderId) return
    await saveOverlay({ ...overlay, folderId })
  }

  return (
    <CustomOverlaysContext.Provider
      value={{ overlays, saveOverlay, deleteOverlay, testOverlay, folders, saveFolder, deleteFolder, moveOverlayToFolder }}
    >
      {children}
    </CustomOverlaysContext.Provider>
  )
}

export function useCustomOverlays(): CustomOverlaysContextValue {
  const ctx = useContext(CustomOverlaysContext)
  if (!ctx) throw new Error('useCustomOverlays must be used within a CustomOverlaysProvider')
  return ctx
}
