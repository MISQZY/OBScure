import { useRef, useState } from 'react'
import {
  MIN_PREVIEW_WIDTH,
  MAX_PREVIEW_WIDTH,
  DEFAULT_PREVIEW_WIDTH,
  PREVIEW_WIDTH_STORAGE_KEY,
  LEGACY_PREVIEW_WIDTH_STORAGE_KEY
} from '../sceneBuilderConstants'
import { readMigratedItem } from '@/lib/legacyStorage'

/**
 * Width (px) of the live preview box — height follows automatically via its
 * own `aspectRatio` CSS (see ScenePreviewPanel's canvas div), so dragging the
 * resize handle can't get the proportions wrong. Persisted across sessions
 * the same way theme/locale are (see ThemeProvider/I18nProvider's own
 * 'obscure:*' localStorage keys) since it's a pure per-user display
 * preference, not scene content.
 */
export function usePreviewResize() {
  const [previewWidth, setPreviewWidth] = useState<number>(() => {
    try {
      const stored = Number(readMigratedItem(PREVIEW_WIDTH_STORAGE_KEY, LEGACY_PREVIEW_WIDTH_STORAGE_KEY))
      return Number.isFinite(stored) && stored >= MIN_PREVIEW_WIDTH && stored <= MAX_PREVIEW_WIDTH ? stored : DEFAULT_PREVIEW_WIDTH
    } catch {
      return DEFAULT_PREVIEW_WIDTH
    }
  })
  const previewResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  /**
   * The preview panel is anchored top-right (position="top-right"), so its
   * top and right edges never move — only a drag on its BOTTOM-LEFT corner
   * reads naturally as "resize" here, growing/shrinking by moving the left
   * edge left/right while width (and, via aspect-ratio, height) follow.
   * Tracked via window-level listeners rather than the handle's own
   * onMouseMove, since the pointer easily outruns a 14px grip mid-drag.
   */
  const handlePreviewResizeStart = (event: React.MouseEvent): void => {
    event.preventDefault()
    previewResizeRef.current = { startX: event.clientX, startWidth: previewWidth }
    const onMove = (moveEvent: MouseEvent): void => {
      const drag = previewResizeRef.current
      if (!drag) return
      const next = drag.startWidth + (drag.startX - moveEvent.clientX)
      setPreviewWidth(Math.min(MAX_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, next)))
    }
    const onUp = (): void => {
      previewResizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setPreviewWidth((width) => {
        try {
          localStorage.setItem(PREVIEW_WIDTH_STORAGE_KEY, String(width))
        } catch {
          // Preview size just won't persist across restarts in this environment.
        }
        return width
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return { previewWidth, handlePreviewResizeStart }
}
