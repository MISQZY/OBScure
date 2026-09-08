import { useState } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { CustomOverlay } from '@shared/types'
import { compareVersions } from '@shared/version'
import { slugify } from '@/lib/custom-overlays'
import { nodeTypes } from '@/components/nodes'

/** The JSON shape Export writes and Import reads back — see downloadExampleTheme/Locale in CustomConfigProvider for the same open/save-dialog pattern applied to themes and locale packs. */
export interface SceneExportPayload {
  name: string
  nodes: Node[]
  edges: Edge[]
  /** App version this was exported from — lets Import warn when it's older OR newer than the app running now, since the graph format can change between releases. */
  appVersion: string
}

/** Every type a node in a saved/imported graph can legitimately be — the same registry <ReactFlow nodeTypes={...}> itself renders off of (see SceneBuilderPage.tsx), so this can't drift out of step with what the editor actually knows how to render. Includes 'scene'/'frame' (absent from NODE_PALETTE, which only lists what's directly placeable) since a real export always has at least a Scene node. */
const VALID_NODE_TYPES = new Set(Object.keys(nodeTypes))

function hasValidPosition(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false
  const pos = value as Record<string, unknown>
  return typeof pos.x === 'number' && typeof pos.y === 'number'
}

/** A node from an imported file is trusted enough to hand to React Flow/the graph walkers in sceneUtils only once it has a real id, a type this build actually knows how to render, and a numeric position — anything less (hand-edited JSON, a newer export with node types this build predates, plain corruption) risks a crash deep in NODE_SOCKETS/dagre/sortNodesForParenting lookups that all assume a well-formed node. */
function isValidImportedNode(value: unknown): value is Node {
  if (!value || typeof value !== 'object') return false
  const node = value as Partial<Node>
  return typeof node.id === 'string' && typeof node.type === 'string' && VALID_NODE_TYPES.has(node.type) && hasValidPosition(node.position)
}

/** An edge from an imported file is only trusted once both ends reference a node that's actually present in the SAME file's own node set — an edge dangling off a missing node is exactly the kind of thing a hand-edited export could produce, and every graph walker here (incoming/buildNodeMap-based lookups) assumes edges only ever point at real nodes. */
function isValidImportedEdge(value: unknown, nodeIds: Set<string>): value is Edge {
  if (!value || typeof value !== 'object') return false
  const edge = value as Partial<Edge>
  return typeof edge.id === 'string' && typeof edge.source === 'string' && typeof edge.target === 'string' && nodeIds.has(edge.source) && nodeIds.has(edge.target)
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
  // Set only when the imported file's own appVersion doesn't match the
  // app's current version (older or newer) — holds the parsed graph until
  // the user confirms through the warning dialog (or cancels, discarding it).
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
    if (!payload.nodes.every(isValidImportedNode)) {
      setImportInvalid(true)
      return
    }
    const nodeIds = new Set(payload.nodes.map((n) => n.id))
    if (!payload.edges.every((e) => isValidImportedEdge(e, nodeIds))) {
      setImportInvalid(true)
      return
    }

    const currentVersion = await window.obscure.getAppVersion()
    // Any mismatch — the export is either OLDER or NEWER than this build —
    // can mean a graph format the current app doesn't fully agree with, so
    // both directions get the same warning (see SceneExportPayload's own
    // doc comment); only an exact version match skips it.
    if (typeof payload.appVersion === 'string' && compareVersions(currentVersion, payload.appVersion) !== 0) {
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
