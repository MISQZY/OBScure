import type { OverlayUrls } from '@shared/types'

/** Absolute URL for a file name previously saved via `uploadCustomImage` (served by the app's own local overlay HTTP server) — null until `urls` resolves or when there's no file to show. */
export function customImageUrl(urls: OverlayUrls | null, fileName: string | null | undefined): string | null {
  if (!urls || !fileName) return null
  return `http://${urls.host}:${urls.port}/overlays/custom-images/${encodeURIComponent(fileName)}`
}
