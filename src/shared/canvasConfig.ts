/**
 * The stream canvas the Scene Builder's in-app scene preview is drawn at —
 * purely a visual aid so the preview's proportions match what OBS will
 * actually show, and the reference resolution a scene's node positions
 * (x/y/width/height) are authored against. Distinct from a Browser Source's
 * own size in OBS, which stays entirely up to the user.
 */
export const ASPECT_RATIO_IDS = ['16:9', '9:16', '4:3', '3:4', '1:1', 'custom'] as const
export type AspectRatioId = (typeof ASPECT_RATIO_IDS)[number]

/** Width-over-height for every preset but 'custom', which keeps width/height independently editable. */
export const ASPECT_RATIO_VALUES: Record<Exclude<AspectRatioId, 'custom'>, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '1:1': 1
}

export interface CanvasConfig {
  width: number
  height: number
  aspectRatio: AspectRatioId
}

export const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
  width: 1920,
  height: 1080,
  aspectRatio: '16:9'
}

function isAspectRatioId(value: unknown): value is AspectRatioId {
  return typeof value === 'string' && (ASPECT_RATIO_IDS as readonly string[]).includes(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** Mirrors the overlay configs' normalize* functions — repairs missing/invalid fields instead of discarding the rest. */
export function normalizeCanvasConfig(value: unknown): CanvasConfig {
  const entry = (value && typeof value === 'object' ? value : {}) as Partial<CanvasConfig>
  return {
    width: isPositiveInteger(entry.width) ? Math.round(entry.width) : DEFAULT_CANVAS_CONFIG.width,
    height: isPositiveInteger(entry.height) ? Math.round(entry.height) : DEFAULT_CANVAS_CONFIG.height,
    aspectRatio: isAspectRatioId(entry.aspectRatio) ? entry.aspectRatio : DEFAULT_CANVAS_CONFIG.aspectRatio
  }
}
