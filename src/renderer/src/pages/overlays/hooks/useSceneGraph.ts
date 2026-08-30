import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  ReactFlowInstance
} from '@xyflow/react'
import { NODE_SOCKETS, NODE_OUTPUTS, NODE_DEFAULTS } from '@/components/nodes'
import type { CustomOverlay } from '@shared/types'
import { PROCESS_TYPES, CONTAINER_TYPES, sortNodesForParenting, withFrameZIndex, FRAME_Z_INDEX, layoutGraph, migrateLegacyModifierEdges, migrateLegacyAudioPlayerEdges } from '../sceneUtils'
import { defaultNodes, defaultEdges } from '../sceneBuilderConstants'

/**
 * Owns the graph itself — nodes/edges state, loading them from the selected
 * overlay, and every React Flow interaction handler (wiring, dragging,
 * dropping from the Add Node palette, Prettify). Everything here only
 * touches local editor state; nothing is persisted until Save (see
 * useOverlayMeta's own handleSave), so any of it is always safe to try and
 * undo by just not saving.
 */
export function useSceneGraph(overlay: CustomOverlay | undefined) {
  const [nodes, setNodes] = useState<Node[]>(defaultNodes)
  const [edges, setEdges] = useState<Edge[]>(defaultEdges)
  /** Captured via onInit on <ReactFlow> — SceneBuilderPage renders it itself rather than being a descendant of it, so useReactFlow() isn't available directly; this ref is the standard workaround for reaching imperative methods (fitView, getIntersectingNodes) from outside the flow tree. */
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null)

  useEffect(() => {
    if (overlay) {
      const isBlank = !overlay.nodes || overlay.nodes.length === 0
      setNodes(isBlank ? defaultNodes : withFrameZIndex(sortNodesForParenting(overlay.nodes)))
      setEdges(isBlank ? defaultEdges : migrateLegacyAudioPlayerEdges(migrateLegacyModifierEdges(overlay.edges || [])))
    } else {
      setNodes(defaultNodes)
      setEdges(defaultEdges)
    }
  }, [overlay?.id])

  /**
   * One-shot auto-arrange via layoutGraph (dagre) — only touches local
   * editor state (`nodes`), same as dragging a node by hand; nothing is
   * persisted until Save, so it's always safe to try and undo by just not
   * saving. The double rAF before fitView gives React (and ReactFlow's own
   * internal node measurement) one full paint cycle to actually apply the
   * new positions before the camera tries to frame them — calling fitView
   * synchronously right after setNodes would still see the OLD layout.
   */
  const handlePrettify = (): void => {
    setNodes((nds) => layoutGraph(nds, edges))
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        reactFlowInstanceRef.current?.fitView({ duration: 300, padding: 0.15 })
      })
    })
  }

  const onNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      const instance = reactFlowInstanceRef.current
      if (!instance || node.type === 'frame') return

      const intersections = instance.getIntersectingNodes(node).filter((n) => n.type === 'frame')
      const targetFrame = intersections[0]

      // Wait for React Flow to finish flushing its position changes (dragging: false)
      setTimeout(() => {
        setNodes((nds) => {
          const getAbsolute = (nId: string) => {
            let curr = nds.find((x) => x.id === nId)
            if (!curr) return { x: 0, y: 0 }
            let x = curr.position.x
            let y = curr.position.y
            while (curr.parentId) {
              curr = nds.find((x) => x.id === curr!.parentId)
              if (!curr) break
              x += curr.position.x
              y += curr.position.y
            }
            return { x, y }
          }

          const absNodePos = getAbsolute(node.id)

          const reparented = nds.map((n) => {
            if (n.id === node.id) {
              if (targetFrame && n.parentId !== targetFrame.id) {
                const absFramePos = getAbsolute(targetFrame.id)
                return {
                  ...n,
                  position: {
                    x: absNodePos.x - absFramePos.x,
                    y: absNodePos.y - absFramePos.y
                  },
                  parentId: targetFrame.id
                }
              } else if (!targetFrame && n.parentId) {
                return {
                  ...n,
                  position: {
                    x: absNodePos.x,
                    y: absNodePos.y
                  },
                  parentId: undefined
                }
              }
            }
            return n
          })

          // A newly-set parentId only helps if the Frame is actually ahead
          // of this node in the array — see sortNodesForParenting's own doc
          // comment for why React Flow silently mispositions the child
          // otherwise (the exact "flies off" bug this fixes).
          return sortNodesForParenting(reparented)
        })
      }, 50) // Use 50ms to ensure onNodesChange has fully executed
    },
    [setNodes]
  )

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  /**
   * Blender-style single-value sockets: dropping a new wire onto a socket
   * that isn't `multi` (see NODE_SOCKETS in components/nodes) bumps
   * whatever was already plugged into it instead of stacking both — same
   * behavior Blender uses for single-value inputs. `multi` sockets (Box's
   * Children, Scene's Content) accept any number of wires unchanged. The
   * process sequence-flow socket (event-in) isn't in NODE_SOCKETS but is
   * conceptually single too — a step has exactly one predecessor.
   */
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const targetNode = nodes.find((n) => n.id === params.target)
        const socket = targetNode ? NODE_SOCKETS[targetNode.type!]?.find((s) => s.id === params.targetHandle) : undefined
        const multi = params.targetHandle !== 'event-in' && Boolean(socket?.multi)
        const base = multi ? eds : eds.filter((e) => !(e.target === params.target && e.targetHandle === params.targetHandle))
        return addEdge(params, base)
      })
    },
    [nodes]
  )

  /**
   * Keeps the Event socket (sequence flow, id "event-in" — see BaseNode's
   * sequenceIn) strictly for connecting one process step to the next: only
   * a Start/Task/Wait/End can feed it. Every other socket is validated
   * against NODE_SOCKETS' accepts list for the target node's type/socket —
   * the same list BaseNode itself reads to render each socket, so a process
   * node's output (never in any accepts list) naturally can't land on a
   * plain parameter socket either, without needing a separate check. For a
   * source node with its own NODE_OUTPUTS (Text/Image/Box), the SPECIFIC
   * output socket used also has to list the target socket in its `feeds` —
   * e.g. dragging from Box's "As Target" dot can only land on a Task's
   * Target socket, not Scene's Content, even though a plain Box is
   * otherwise allowed there via the "Structural" output.
   */
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return false
      if (connection.targetHandle === 'event-in') return PROCESS_TYPES.has(sourceNode.type!)
      const socket = NODE_SOCKETS[targetNode.type!]?.find((s) => s.id === connection.targetHandle)
      if (!socket || !socket.accepts.includes(sourceNode.type!)) return false
      const outputSockets = NODE_OUTPUTS[sourceNode.type!]
      if (outputSockets) {
        const outSocket = outputSockets.find((o) => o.id === connection.sourceHandle)
        if (!outSocket || !outSocket.feeds.includes(connection.targetHandle!)) return false
      }
      // Box and Group can each nest either one (see BOX_SOCKETS' own doc
      // comment in components/nodes/index.tsx) — the one connection shape in
      // this whole graph that CAN form a cycle (A contains B contains A),
      // which would recurse forever in BoxView/buildBox. Reject a
      // container→container `children` connection if the target is already
      // a descendant of the source — i.e. the source already (transitively)
      // contains the target, so wiring the target to also contain the
      // source would close the loop.
      if (CONTAINER_TYPES.has(sourceNode.type!) && CONTAINER_TYPES.has(targetNode.type!) && connection.targetHandle === 'children') {
        const stack = [sourceNode.id]
        const seen = new Set<string>()
        while (stack.length) {
          const id = stack.pop()!
          if (id === targetNode.id) return false
          if (seen.has(id)) continue
          seen.add(id)
          for (const e of edges) {
            if (e.target === id && e.targetHandle === 'children' && CONTAINER_TYPES.has(nodes.find((n) => n.id === e.source)?.type ?? '')) {
              stack.push(e.source)
            }
          }
        }
      }
      return true
    },
    [nodes, edges]
  )

  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setEdges((eds) => eds.filter((e) => e.id !== edge.id))
  }, [])

  const addNode = (type: string, position: { x: number; y: number }): void => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      // Spread a fresh copy of NODE_DEFAULTS[type] (rather than the same
      // object reference) so editing this node's data can never mutate the
      // shared defaults for every other node of this type.
      data: { ...(NODE_DEFAULTS[type] ?? {}) },
      zIndex: type === 'frame' ? FRAME_Z_INDEX : undefined
    }
    setNodes((nds) => [...nds, newNode])
  }

  // Drag-and-drop from the Add Node palette — see the palette buttons'
  // draggable/onDragStart in AddNodePalette and the canvas wrapper's
  // onDrop/onDragOver below. The palette button's own type is passed via
  // dataTransfer rather than closed over, since the drop handler is bound
  // once on the canvas wrapper, not per palette entry.
  const onPaletteDragStart = (event: React.DragEvent, type: string): void => {
    event.dataTransfer.setData('application/reactflow', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onCanvasDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onCanvasDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/reactflow')
    if (!type || !reactFlowInstanceRef.current) return
    const position = reactFlowInstanceRef.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    })
    addNode(type, position)
  }, [])

  return {
    nodes,
    setNodes,
    edges,
    setEdges,
    reactFlowInstanceRef,
    handlePrettify,
    onNodeDragStop,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    onEdgeDoubleClick,
    addNode,
    onPaletteDragStart,
    onCanvasDragOver,
    onCanvasDrop
  }
}
