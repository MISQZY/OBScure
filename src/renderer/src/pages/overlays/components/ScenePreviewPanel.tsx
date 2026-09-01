import { useState } from 'react'
import { Panel, Node, Edge } from '@xyflow/react'
import { PanelRight, Play } from 'lucide-react'
import type { OverlayUrls } from '@shared/types'
import { CanvasConfig } from '@shared/canvasConfig'
import { findBackgroundFx, findBackgroundFxLabel, ScheduledTask } from '../sceneUtils'
import { BackgroundFxLayer, ScenePreview, PreviewEventState } from '../views'

/**
 * The floating top-right panel — a live, decorative mirror of the real
 * overlay at its real aspect ratio, scaled down to fit. Below `isCompact`
 * (see useResponsiveCanvasLayout) it collapses to just a toggle button
 * instead of vanishing outright — same pattern as the Add Node palette, so
 * there's always a visible way to bring it back rather than it just
 * disappearing.
 */
export function ScenePreviewPanel({
  isCompact,
  previewWidth,
  onResizeStart,
  canvasConfig,
  nodes,
  edges,
  urls,
  playToken,
  onPlay,
  eventState,
  processSchedule,
  processClockMs,
  previewPlayed
}: {
  isCompact: boolean
  previewWidth: number
  onResizeStart: (event: React.MouseEvent) => void
  canvasConfig: CanvasConfig
  nodes: Node[]
  edges: Edge[]
  urls: OverlayUrls | null
  playToken: number
  onPlay: () => void
  eventState: PreviewEventState
  processSchedule: ScheduledTask[]
  processClockMs: number
  previewPlayed: boolean
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const backgroundFxNode = findBackgroundFx(nodes, edges)

  return (
    <Panel position="top-right" data-tour="scene-builder-preview" className="m-4 flex flex-col items-end gap-2">
      {isCompact && (
        <button
          type="button"
          onClick={() => setPreviewOpen((open) => !open)}
          title={previewOpen ? 'Hide preview' : 'Show preview'}
          className="flex items-center justify-center p-2.5 rounded-lg border bg-card shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <PanelRight className="size-4" />
        </button>
      )}
      {(!isCompact || previewOpen) && (
        <div
          className="scene-preview-canvas isolate border border-border rounded-lg overflow-hidden relative flex items-center justify-center pointer-events-none opacity-90"
          style={{
            width: previewWidth,
            aspectRatio: canvasConfig.aspectRatio === 'custom' ? `${canvasConfig.width}/${canvasConfig.height}` : canvasConfig.aspectRatio.replace(':', '/')
          }}
        >
          <div className="absolute z-10 top-2 right-2 flex items-center gap-1.5 bg-black/70 rounded-full pl-2.5 pr-1 py-1">
            <span className="text-white text-xs font-medium">Preview</span>
            <button
              type="button"
              onClick={onPlay}
              title="Play animations & sound"
              className="pointer-events-auto flex items-center justify-center size-5 rounded-full bg-white/15 text-white hover:bg-white/30 transition-colors cursor-pointer"
            >
              <Play className="size-3 fill-current" />
            </button>
          </div>
          {/* Bottom-left corner: the one corner that actually moves as this top-right-anchored box grows/shrinks — see usePreviewResize's own doc comment. Themed bg-card/border chip (not bare white lines) so the grip stays visible regardless of what color the scene underneath happens to be — a plain white icon disappeared against light overlay content. */}
          <div
            onMouseDown={onResizeStart}
            title="Drag to resize preview"
            className="pointer-events-auto absolute z-10 bottom-1 left-1 flex items-center justify-center size-4 rounded-sm bg-card/90 border border-border cursor-sw-resize opacity-70 hover:opacity-100 transition-opacity"
          >
            <div className="size-1.5 border-b-2 border-l-2 border-foreground/80 rounded-bl-sm" />
          </div>
          <div
            // shrink-0 is the actual fix (see the diagnostic session that
            // found this): this div is a flex ITEM of the
            // .scene-preview-canvas flex container above (width:
            // previewWidth, user-resizable — see usePreviewResize). Without
            // shrink-0, flexbox's default flex-shrink:1 compresses this
            // box's WIDTH down to fit that container BEFORE the scale()
            // transform below even runs — squashing it down from the real
            // 1920px, while height stays correct (cross-axis, unaffected by
            // flex-shrink under items-center). Content that just centers
            // within whatever width it gets (the alert box) tolerated this
            // well enough to look "mostly fine"; a percentage-sized
            // background (background-size: 200% 200%, the 'gradient'
            // Background FX type) is far more sensitive to the exact width
            // and rendered as a narrow off-proportion band instead of a
            // full-canvas sweep.
            className="relative origin-center overflow-hidden shrink-0"
            style={{
              width: canvasConfig.width,
              height: canvasConfig.height,
              transform: `scale(${previewWidth / canvasConfig.width})`
            }}
          >
            <BackgroundFxLayer
              node={backgroundFxNode}
              label={findBackgroundFxLabel(backgroundFxNode, nodes, edges, eventState.vars)}
              urls={urls}
              playToken={playToken}
              played={previewPlayed}
            />
            <ScenePreview nodes={nodes} edges={edges} playToken={playToken} eventState={eventState} schedule={processSchedule} clockMs={processClockMs} urls={urls} />
          </div>
        </div>
      )}
    </Panel>
  )
}
