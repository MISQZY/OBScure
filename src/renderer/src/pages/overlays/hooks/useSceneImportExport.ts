import { useState } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { CustomOverlay } from '@shared/types'
import { compareVersions } from '@shared/version'
import { slugify } from '@/lib/custom-overlays'

/** The JSON shape Export writes and Import reads back — see downloadExampleTheme/Locale in CustomConfigProvider for the same open/save-dialog pattern applied to themes and locale packs. */
export interface SceneExportPayload {
  name: string
  nodes: Node[]
  edges: Edge[]
  /** App version this was exported from — lets Import warn when it's older than the app running now, since the graph format can change between releases. */
  appVersion: string
}

/**
 * Export/import of a single scene's own graph as a standalone JSON file —
 * for backing up a scene or copying it to another install. Import replaces
 * the CURRENTLY OPEN scene's graph (via useSceneGraph's own importGraph,
 * which goes through the same undo history as every other graph mutation)
 * rather than creating a new scene, and never touches id/name/urlKey — so a
 * Browser Source already pointed at this scene keeps working.
 */
export function useSceneImportExport({
  overlay,
  nodes,
  edges,
  importGraph
}: {
  overlay: CustomOverlay | undefined
  nodes: Node[]
  edges: Edge[]
  importGraph: (nodes: Node[], edges: Edge[]) => void
}) {
  const [importInvalid, setImportInvalid] = useState(false)
  // Set only when the imported file's own appVersion is older than the
  // app's current version — holds the parsed graph until the user confirms
  // through the warning dialog (or cancels, discarding it).
  const [pendingImport, setPendingImport] = useState<{
    nodes: Node[]
    edges: Edge[]
    savedVersion: string
    currentVersion: string
  } | null>(null)

  const handleExport = async (): Promise<void> => {
    if (!overlay) return
    const appVersion = await window.obscure.getAppVersion()
    const payload: SceneExportPayload = { name: overlay.name, nodes, edges, appVersion }
    await window.obscure.saveConfigFile(`${overlay.urlKey || slugify(overlay.name)}.json`, JSON.stringify(payload, null, 2))
  }

  const handleImport = async (): Promise<void> => {
    const file = await window.obscure.openConfigFile()
    if (!file) return

    let parsed: unknown
    try {
      parsed = JSON.parse(file.content)
    } catch {
      setImportInvalid(true)
      return
    }
    if (!parsed || typeof parsed !== 'object') {
      setImportInvalid(true)
      return
    }
    const payload = parsed as Partial<SceneExportPayload>
    if (!Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) {
      setImportInvalid(true)
      return
    }

    const currentVersion = await window.obscure.getAppVersion()
    if (typeof payload.appVersion === 'string' && compareVersions(currentVersion, payload.appVersion) > 0) {
      setPendingImport({
        nodes: payload.nodes as Node[],
        edges: payload.edges as Edge[],
        savedVersion: payload.appVersion,
        currentVersion
      })
      return
    }
    importGraph(payload.nodes as Node[], payload.edges as Edge[])
  }

  const confirmPendingImport = (): void => {
    if (!pendingImport) return
    importGraph(pendingImport.nodes, pendingImport.edges)
    setPendingImport(null)
  }

  return {
    handleExport,
    handleImport,
    importInvalid,
    dismissImportInvalid: () => setImportInvalid(false),
    pendingImportVersions: pendingImport ? { saved: pendingImport.savedVersion, current: pendingImport.currentVersion } : null,
    confirmPendingImport,
    cancelPendingImport: () => setPendingImport(null)
  }
}
