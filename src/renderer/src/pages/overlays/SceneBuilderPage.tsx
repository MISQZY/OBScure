import { useEffect, useState } from 'react'
import { ReactFlow, Controls, Background, MiniMap } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './scene-preview-animations.css'
import './scene-builder-canvas.css'
import { cn } from '@/lib/utils'
import { nodeTypes, SavedNodeDataProvider } from '@/components/nodes'
import { useTheme } from '@/providers/ThemeProvider'
import { useCustomOverlays } from '@/providers/CustomOverlaysProvider'
import { Workflow } from 'lucide-react'
import type { NavKey } from '@/lib/nav'
import type { OverlayUrls } from '@shared/types'
import { CanvasConfig, DEFAULT_CANVAS_CONFIG } from '@shared/canvasConfig'
import { useTour } from '@/providers/TourProvider'
import { displayEdges, minimapNodeColor, sceneTrigger, sceneAudioTrigger, processTrigger, buildProcessSchedule, processExitBufferMs } from './sceneUtils'
import { ProcessToken } from './views'
import { useSceneGraph } from './hooks/useSceneGraph'
import { useOverlayMeta } from './hooks/useOverlayMeta'
import { useScenePlayback } from './hooks/useScenePlayback'
import { useResponsiveCanvasLayout } from './hooks/useResponsiveCanvasLayout'
import { usePreviewResize } from './hooks/usePreviewResize'
import { SceneBuilderToolbar } from './components/SceneBuilderToolbar'
import { AddNodePalette } from './components/AddNodePalette'
import { ScenePreviewPanel } from './components/ScenePreviewPanel'

export function SceneBuilderPage({
  customOverlayId,
  onNavigate
}: {
  customOverlayId?: string
  onNavigate: (key: NavKey) => void
}) {
  const { resolvedThemeId, themes } = useTheme()
  const isDark = themes.find((t) => t.id === resolvedThemeId)?.mode === 'dark'

  const { overlays, saveOverlay, deleteOverlay, testOverlay } = useCustomOverlays()
  const { start: startTour } = useTour()

  const overlay = customOverlayId ? overlays.find((o) => o.id === customOverlayId) : undefined

  // React Flow's own Controls panel has a built-in lock/unlock (padlock)
  // button — this is the "locked mode" it toggles. On its own that button
  // only flips React Flow's internal nodesDraggable/nodesConnectable/
  // elementsSelectable flags, which don't touch plain DOM <input>s inside a
  // custom node, and doesn't stop the Delete key from removing an
  // already-selected node either. Lifting it into real state here — passed
  // down as explicit (controlled) props below — is what lets locked mode
  // actually block deletion and node-content editing, not just dragging.
  const [locked, setLocked] = useState(false)

  const {
    nodes,
    edges,
    reactFlowInstanceRef,
    handlePrettify,
    onNodeDragStart,
    onNodeDragStop,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    onEdgeDoubleClick,
    onPaletteDragStart,
    onCanvasDragOver,
    onCanvasDrop
  } = useSceneGraph(overlay, locked)

  const {
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
  } = useOverlayMeta({ overlay, overlays, saveOverlay, deleteOverlay, onNavigate, nodes, edges })

  const [urls, setUrls] = useState<OverlayUrls | null>(null)
  useEffect(() => {
    window.maddoner.getOverlayUrls().then(setUrls)
  }, [])

  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig>(DEFAULT_CANVAS_CONFIG)
  useEffect(() => {
    window.maddoner.getCanvasConfig().then(setCanvasConfig)
  }, [])

  const { playToken, eventPhase, eventVars, processClockMs, testStatus, handlePlay, handleTest } = useScenePlayback({
    overlay,
    nodes,
    edges,
    urls,
    testOverlay
  })

  const { canvasWrapperRef, isCompact, isNarrow } = useResponsiveCanvasLayout()
  const { previewWidth, handlePreviewResizeStart } = usePreviewResize()

  if (!overlay) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
        <Workflow className="w-16 h-16 mb-4 opacity-50" />
        <h2 className="text-xl font-semibold text-foreground">No Scene Selected</h2>
        <p className="mt-2 text-center max-w-sm">
          Please select an overlay from the sidebar or create a new one using the "+" button under "Overlays".
        </p>
      </div>
    )
  }

  // A Start node (processTrigger) takes priority over the plain
  // Event+Timer→Scene model (sceneTrigger), which itself takes priority
  // over Audio-Player-driven visibility (sceneAudioTrigger) — see the doc
  // comment on nodeTypes in components/nodes/index.tsx. Roulette has no
  // scene-wide equivalent of its own — its Widget shows unconditionally by
  // default, optionally gated per-widget via its own Visibility socket
  // instead (see ROULETTE_OUTPUTS' own doc comment in components/nodes/
  // constants.ts).
  const proc = processTrigger(nodes, edges)
  const trigger = proc.active ? null : sceneTrigger(nodes, edges)
  const audioTrigger = !proc.active && !trigger?.active && sceneAudioTrigger(nodes, edges)
  const eventActive = proc.active || Boolean(trigger?.active) || audioTrigger
  const eventState = {
    active: eventActive,
    visible: eventPhase !== 'idle',
    hiding: eventPhase === 'hiding',
    vars: eventActive ? eventVars : null,
    alertTypes: proc.active ? proc.alertTypes : (trigger?.alertTypes ?? [])
  }
  const processBuilt = proc.active ? buildProcessSchedule(nodes, edges) : null
  const processSchedule = processBuilt?.schedule ?? []
  // Real length (ms) of a running Process preview, totalMs plus the same
  // exit-animation buffer handlePlay's own rAF loop runs the clock out to —
  // what ProcessToken's clockMs is counted against (see its own doc
  // comment), so the token finishes crossing the whole chain exactly as the
  // preview run actually ends instead of drifting out of sync with it.
  const processDurationMs = proc.active ? (processBuilt?.totalMs ?? 0) + processExitBufferMs(processSchedule, processBuilt?.totalMs ?? 0) : 0
  // Background FX cuts instantly on hide rather than riding out the content's
  // exit animation — mirrors overlays/custom.html's hideTriggeredContent,
  // which calls applyBackgroundFx(undefined, ...) before playExitAnimations.
  const previewPlayed = eventState.active ? eventPhase === 'showing' : playToken > 0

  return (
    <div
      ref={canvasWrapperRef}
      className="w-full h-full relative bg-background"
      data-tour="scene-builder-canvas"
      onDragOver={onCanvasDragOver}
      onDrop={onCanvasDrop}
    >
      <SavedNodeDataProvider savedNodes={overlay.nodes}>
        <ReactFlow
          nodes={nodes}
          edges={displayEdges(nodes, edges)}
          onNodesChange={onNodesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          // Default is 20px — bumped up since sockets are small, densely
          // labeled rows (see SocketRow/OutputRow in components/nodes/
          // index.tsx): this is how forgiving the DROP end of a drag is,
          // once it's already under way (the .react-flow__handle::after
          // rule in scene-builder-canvas.css is what forgives the START).
          connectionRadius={40}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance
          }}
          nodeTypes={nodeTypes}
          colorMode={isDark ? 'dark' : 'light'}
          fitView
          // Controlled so Controls' own lock button (onInteractiveChange
          // below) actually reaches our `locked` state instead of only
          // flipping React Flow's internal store — see the doc comment on
          // that state above. deleteKeyCode={null} additionally covers a
          // node that was already selected before locking, which
          // elementsSelectable alone wouldn't retroactively deselect.
          nodesDraggable={!locked}
          nodesConnectable={!locked}
          elementsSelectable={!locked}
          deleteKeyCode={locked ? null : ['Backspace', 'Delete']}
          className={cn('bg-background', locked && 'locked')}
        >
          <Background />
          <Controls onInteractiveChange={(isInteractive) => setLocked(!isInteractive)} />
          <MiniMap nodeColor={minimapNodeColor} maskColor="rgba(0, 0, 0, 0.6)" pannable zoomable className="!bg-card !border !border-border" />
          <ProcessToken nodes={nodes} edges={edges} clockMs={processClockMs} durationMs={processDurationMs} active={proc.active && eventPhase === 'showing'} />
          <SceneBuilderToolbar
            overlay={overlay}
            urls={urls}
            nameInput={nameInput}
            setNameInput={setNameInput}
            urlKeyInput={urlKeyInput}
            setUrlKeyInput={setUrlKeyInput}
            urlKeyLocked={urlKeyLocked}
            setUrlKeyLocked={setUrlKeyLocked}
            urlKeyError={urlKeyError}
            commitName={commitName}
            commitUrlKey={commitUrlKey}
            onDelete={() => void handleDelete()}
            onPrettify={handlePrettify}
            saveStatus={saveStatus}
            onSave={() => void handleSave()}
            testStatus={testStatus}
            onTest={() => void handleTest()}
            onStartTour={() => startTour('sceneBuilder')}
          />
          <AddNodePalette isNarrow={isNarrow} onPaletteDragStart={onPaletteDragStart} />
          <ScenePreviewPanel
            isCompact={isCompact}
            previewWidth={previewWidth}
            onResizeStart={handlePreviewResizeStart}
            canvasConfig={canvasConfig}
            nodes={nodes}
            edges={edges}
            urls={urls}
            playToken={playToken}
            onPlay={handlePlay}
            eventState={eventState}
            processSchedule={processSchedule}
            processClockMs={processClockMs}
            previewPlayed={previewPlayed}
          />
        </ReactFlow>
      </SavedNodeDataProvider>
    </div>
  )
}
