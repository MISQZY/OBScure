const SAFE_HOST_PATTERN = /^[a-zA-Z0-9.-]+$/

/**
 * CSP for the app shell (control panel) window only — never applied to the
 * overlay pages themselves (those are separate documents loaded in an
 * iframe/OBS, requested with resourceType "subFrame"/outside our session
 * entirely, and rely on inline <script> the app shell doesn't need).
 *
 * frame-src must include whatever host:port the overlay server is currently
 * bound to so the in-app live preview can embed it; that's user-editable at
 * runtime (Settings page), so this is computed per-request rather than baked
 * into a build-time meta tag.
 */
export function buildAppShellCsp(overlayHost: string, overlayPort: number): string {
  const localSources = ["'self'", 'http://127.0.0.1:*', 'http://localhost:*']

  const port = Number.isInteger(overlayPort) && overlayPort > 0 && overlayPort <= 65535 ? overlayPort : null
  if (SAFE_HOST_PATTERN.test(overlayHost) && port) {
    localSources.push(`http://${overlayHost}:${port}`)
  }

  return [
    "default-src 'self'",
    // Scene Builder's Background FX preview loads the real paratrooper.js/
    // airdrop.js from the overlay HTTP server via a dynamically injected
    // <script> tag (see loadOverlayEffectScripts in SceneBuilderPage.tsx) —
    // without localSources here that's a cross-origin script blocked by CSP
    // in the packaged app (dev is unaffected — this whole CSP is skipped
    // there, see the onHeadersReceived guard in index.ts).
    `script-src ${localSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    // Scene Builder's live Preview (custom-uploaded images/sounds, per-scene
    // thumbnails) fetches them straight from the overlay HTTP server — a
    // different origin from the app shell's own file:// document — so
    // without this it silently falls back to default-src 'self' and every
    // <img> from that server 404s-looking (actually CSP-blocked) in the
    // packaged app. Not an issue in dev: this whole CSP is skipped there
    // (see the onHeadersReceived guard in index.ts).
    // 'data:' covers the dashboard's now-playing cover art: main downloads it
    // once (NowPlayingCache) and hands the renderer a data: URI instead of
    // the original Spotify CDN URL, so the <img> never makes its own network
    // request and doesn't need a CDN host added here.
    `img-src ${localSources.join(' ')} data:`,
    `frame-src ${localSources.join(' ')}`
  ].join('; ')
}
