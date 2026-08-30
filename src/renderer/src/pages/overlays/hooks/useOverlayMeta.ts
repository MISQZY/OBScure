import { useState, useEffect } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { CustomOverlay } from '@shared/types'
import type { NavKey } from '@/lib/nav'
import { slugify, uniqueUrlKey } from '@/lib/custom-overlays'
import type { SaveStatus } from '../sceneUtils'

/**
 * Owns the scene's own name/URL-key editing (including the "URL key follows
 * Name until you touch it yourself" permalink behavior) plus Save/Delete —
 * everything about the overlay record itself, as opposed to its graph
 * content (see useSceneGraph).
 */
export function useOverlayMeta({
  overlay,
  overlays,
  saveOverlay,
  deleteOverlay,
  onNavigate,
  nodes,
  edges
}: {
  overlay: CustomOverlay | undefined
  overlays: CustomOverlay[]
  saveOverlay: (overlay: CustomOverlay) => Promise<void>
  deleteOverlay: (id: string) => Promise<void>
  onNavigate: (key: NavKey) => void
  nodes: Node[]
  edges: Edge[]
}) {
  const [nameInput, setNameInput] = useState('')
  const [urlKeyInput, setUrlKeyInput] = useState('')
  const [urlKeyError, setUrlKeyError] = useState<string | null>(null)
  /**
   * Permalink-style follow: while false, the URL key auto-updates to track
   * the Name as you type it (see the name input's onChange in
   * SceneBuilderToolbar), so the page address matches the scene name by
   * default. The moment the URL key field itself is edited it locks (true)
   * and stops following further name edits, protecting a Browser Source
   * already pointed at that address from silently breaking on a later
   * rename.
   */
  const [urlKeyLocked, setUrlKeyLocked] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  useEffect(() => {
    if (!overlay) return
    setNameInput(overlay.name)
    setUrlKeyInput(overlay.urlKey)
    setUrlKeyError(null)
    // A urlKey that doesn't match what a fresh slugify(name) would produce
    // means it was deliberately customized (or auto-suffixed for a
    // collision) at some point — treat that as already locked rather than
    // silently resyncing it the next time the name changes.
    setUrlKeyLocked(overlay.urlKey !== slugify(overlay.name))
  }, [overlay?.id])

  const commitName = (): void => {
    if (!overlay) return
    const name = nameInput.trim()
    if (!name) {
      setNameInput(overlay.name)
      return
    }
    setNameInput(name)

    // Still following: the URL key moves with the name, same as the live
    // preview while typing (see the name input's onChange in
    // SceneBuilderToolbar) — recomputed here (rather than trusting
    // urlKeyInput) so it reflects the final trimmed name and a fresh
    // uniqueness check.
    if (!urlKeyLocked) {
      const key = uniqueUrlKey(name, overlays.filter((o) => o.id !== overlay.id).map((o) => o.urlKey))
      setUrlKeyInput(key)
      if (name === overlay.name && key === overlay.urlKey) return
      void saveOverlay({ ...overlay, name, urlKey: key })
      return
    }

    if (name === overlay.name) return
    void saveOverlay({ ...overlay, name })
  }

  const commitUrlKey = (): void => {
    if (!overlay) return
    const key = slugify(urlKeyInput)
    if (key === overlay.urlKey) {
      setUrlKeyInput(key)
      setUrlKeyError(null)
      return
    }
    if (overlays.some((o) => o.id !== overlay.id && o.urlKey === key)) {
      setUrlKeyError('This key is already used by another scene.')
      return
    }
    setUrlKeyInput(key)
    setUrlKeyError(null)
    void saveOverlay({ ...overlay, urlKey: key })
  }

  const handleDelete = async (): Promise<void> => {
    if (!overlay) return
    if (!window.confirm(`Delete scene "${overlay.name}"? This cannot be undone.`)) return
    await deleteOverlay(overlay.id)
    onNavigate('dashboard')
  }

  /** Persists the current nodes/edges — a Start/Task/Wait/End process lives directly in them, no separate state to save. */
  const handleSave = async (): Promise<void> => {
    if (!overlay) return
    setSaveStatus('saving')
    try {
      await saveOverlay({ ...overlay, nodes, edges })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

  return {
    nameInput,
    setNameInput,
    urlKeyInput,
    setUrlKeyInput,
    urlKeyError,
    urlKeyLocked,
    setUrlKeyLocked,
    commitName,
    commitUrlKey,
    handleDelete,
    handleSave,
    saveStatus
  }
}
