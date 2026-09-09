import { Node, Edge } from '@xyflow/react'

/**
 * A brand-new scene starts with one working example instead of a blank
 * canvas: Text wired straight into Scene. Scene is the single output/sink —
 * see SceneNode's own doc comment in components/nodes — so this both shows
 * newcomers the pattern (connect content → Scene) and means the scene
 * already renders something the moment it's created.
 */
export const defaultNodes: Node[] = [
  { id: 'scene', type: 'scene', position: { x: 520, y: 140 }, deletable: false, data: {} },
  { id: '1', type: 'text', position: { x: 200, y: 140 }, data: { text: 'Scene Start' } }
]
export const defaultEdges: Edge[] = [{ id: 'e-1-scene', source: '1', target: 'scene' }]

/** Drag-to-resize bounds (px) for the live preview panel — see usePreviewResize. */
export const MIN_PREVIEW_WIDTH = 160
export const MAX_PREVIEW_WIDTH = 720
export const DEFAULT_PREVIEW_WIDTH = 320
/** localStorage key for the preview's remembered width — same 'obscure:*' convention as ThemeProvider/I18nProvider's own persisted preferences. */
export const PREVIEW_WIDTH_STORAGE_KEY = 'obscure:sceneBuilderPreviewWidth'
export const LEGACY_PREVIEW_WIDTH_STORAGE_KEY = 'maddoner:sceneBuilderPreviewWidth'
