import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import type { EventBus } from './eventBus'
import type { AppEvents, CustomOverlay, OverlayAddress, OverlayUrls } from '../shared/types'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg'
}

interface OverlayServerOptions extends OverlayAddress {
  eventBus: EventBus
  /** Directory with static overlay pages (custom.html, ...). */
  overlaysDir: string
  /** Directory with user-uploaded custom alert sounds — writable, unlike overlaysDir which sits in app resources once packaged. */
  customSoundsDir: string
  /** Directory with user-uploaded custom images (Scene Builder's Image node) — same writable-vs-overlaysDir reasoning as customSoundsDir. */
  customImagesDir: string
  initialCustomOverlays?: CustomOverlay[]
}

/** Everything an overlay page needs lives under this one URL prefix — the pages themselves, their config JSON, and (implicitly, via absolute paths) the WS endpoint. */
const OVERLAYS_PREFIX = '/overlays'

/** Custom (uploaded) alert sounds are served from a separate writable directory — see OverlayServerOptions.customSoundsDir — rather than overlaysDir alongside the bundled presets. */
const CUSTOM_SOUNDS_PREFIX = `${OVERLAYS_PREFIX}/custom-sounds/`

/** Custom (uploaded) images — see OverlayServerOptions.customImagesDir. Same idea as CUSTOM_SOUNDS_PREFIX. */
const CUSTOM_IMAGES_PREFIX = `${OVERLAYS_PREFIX}/custom-images/`

/**
 * Serves custom overlay scenes (Scene Builder) that get added to OBS as
 * Browser Sources, and pushes eventBus events to every connected page over a
 * single /ws WebSocket endpoint.
 */
export class OverlayServer {
  private host: string
  private port: number
  private readonly eventBus: EventBus
  private readonly overlaysDir: string
  private readonly customSoundsDir: string
  private readonly customImagesDir: string
  /** Keyed by CustomOverlay.urlKey, not .id — that's what the public overlay URL carries. */
  private customOverlays: Map<string, CustomOverlay> = new Map()
  private server: Server | null = null
  private wss: WebSocketServer | null = null

  constructor(options: OverlayServerOptions) {
    this.host = options.host
    this.port = options.port
    this.eventBus = options.eventBus
    this.overlaysDir = options.overlaysDir
    this.customSoundsDir = options.customSoundsDir
    this.customImagesDir = options.customImagesDir
    this.customOverlays = new Map((options.initialCustomOverlays ?? []).map((overlay) => [overlay.urlKey, overlay]))

    // Registered once here rather than in start() so restart() (stop + start)
    // never ends up with duplicate listeners piling up on the shared eventBus.
    // 'alert' and 'now-playing' are the only AppEvents channels a custom
    // scene actually consumes today — see EventNode/isEventTrigger/
    // processTrigger and AudioPlayerNode/isAudioTrigger in overlays/custom.html.
    this.eventBus.on('alert', (payload) => this.broadcast('alert', payload))
    this.eventBus.on('now-playing', (payload) => this.broadcast('now-playing', payload))
  }

  /**
   * Replaces the whole custom-scenes set and live-broadcasts it so any open
   * Browser Source picks up the change — used for persisted saves (see
   * overlay:saveCustomOverlay/deleteCustomOverlay). Deliberately does NOT
   * also send 'custom-overlay-trigger': a save should update content
   * (text/color/position/...) live without replaying entrance animations or
   * re-firing a Background FX drop that already played — see custom.html's
   * render(overlay, animate), which only animates on that separate event.
   * Use testCustomOverlay for an explicit "play it now".
   */
  setCustomOverlays(overlays: CustomOverlay[]): void {
    this.customOverlays = new Map(overlays.map((overlay) => [overlay.urlKey, overlay]))
    this.broadcast('custom-overlay-config', overlays)
  }

  /**
   * Broadcasts one overlay's current (possibly unsaved) graph WITHOUT
   * persisting it, same "live preview, no disk write" idea as
   * overlay:pushLiveConfig for the transform editor — then tells connected
   * pages to actually play it (see 'custom-overlay-trigger' on AppEvents).
   * Backs the Scene Builder's Test button: try an edit in real OBS before
   * committing Save.
   */
  testCustomOverlay(overlay: CustomOverlay): void {
    this.customOverlays.set(overlay.urlKey, overlay)
    this.broadcast('custom-overlay-config', [...this.customOverlays.values()])
    this.broadcast('custom-overlay-trigger', { urlKey: overlay.urlKey })
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res)
    })
    this.wss = new WebSocketServer({
      server: this.server,
      path: '/ws',
      // Only accept WebSocket upgrades whose Origin matches the overlay
      // server itself — blocks cross-origin connections from malicious
      // scripts running on other pages/sites on the same machine.
      verifyClient: ({ origin }: { origin?: string }) => {
        if (!origin) return true // non-browser clients (e.g. OBS) don't send Origin
        const allowed = `http://${this.host}:${this.port}`
        return origin === allowed || origin === `http://127.0.0.1:${this.port}` || origin === `http://localhost:${this.port}`
      }
    })

    await new Promise<void>((resolvePromise, rejectPromise) => {
      this.server?.once('error', rejectPromise)
      this.server?.listen(this.port, this.host, () => resolvePromise())
    })
  }

  stop(): void {
    this.wss?.close()
    this.server?.close()
    this.wss = null
    this.server = null
  }

  /** Stops and restarts the server, optionally rebinding to a new host/port. */
  async restart(address: Partial<OverlayAddress>): Promise<void> {
    this.stop()
    if (address.host !== undefined) this.host = address.host
    if (address.port !== undefined) this.port = address.port
    await this.start()
  }

  getOverlayUrls(): OverlayUrls {
    return {
      customBase: `http://${this.host}:${this.port}${OVERLAYS_PREFIX}`,
      host: this.host,
      port: this.port
    }
  }

  private broadcast(type: keyof AppEvents, payload: unknown): void {
    const message = JSON.stringify({ type, payload })
    this.wss?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message)
    })
  }
  /** CSP for overlay HTML pages — more permissive than the app shell's (see
   *  csp.ts) because overlays rely on inline <script>, but still restricts
   *  connect-src to same-origin WS and blocks external resource injection. */
  private buildOverlayCsp(): string {
    const self = `http://${this.host}:${this.port}`
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data:`,
      `connect-src 'self' ws://${this.host}:${this.port}`,
      `media-src 'self' ${self}`
    ].join('; ')
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const pathname =
      url.pathname === '/' || url.pathname === OVERLAYS_PREFIX || url.pathname === `${OVERLAYS_PREFIX}/`
        ? `${OVERLAYS_PREFIX}/custom.html`
        : url.pathname

    if (pathname === `${OVERLAYS_PREFIX}/config/custom.json`) {
      const key = url.searchParams.get('key')
      const overlay = key ? (this.customOverlays.get(key) ?? null) : null
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(overlay))
      return
    }

    // Every overlay page/asset lives under /overlays/ — anything else 404s.
    if (!pathname.startsWith(`${OVERLAYS_PREFIX}/`)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }

    const isCustomSound = pathname.startsWith(CUSTOM_SOUNDS_PREFIX)
    const isCustomImage = pathname.startsWith(CUSTOM_IMAGES_PREFIX)
    const rootDir = isCustomSound ? this.customSoundsDir : isCustomImage ? this.customImagesDir : this.overlaysDir
    const relativePath = isCustomSound
      ? pathname.slice(CUSTOM_SOUNDS_PREFIX.length)
      : isCustomImage
        ? pathname.slice(CUSTOM_IMAGES_PREFIX.length)
        : pathname.slice(OVERLAYS_PREFIX.length)

    // Every scene's Browser Source URL is /overlays/<urlKey>.html (see
    // getOverlayUrls/SceneBuilderPage) — there's no per-scene file on disk,
    // they're all the same custom.html template, which reads which scene to
    // render off its own location.pathname client-side (see
    // overlays/custom.html). custom.html is a real file too, so this also
    // covers navigating to it directly (bare "custom" key, no matching
    // scene — renders empty, same as any other unknown key).
    const isCustomScenePage = !isCustomSound && !isCustomImage && /^\/overlays\/[^/]+\.html$/.test(pathname)
    const filePath = isCustomScenePage
      ? normalize(join(this.overlaysDir, 'custom.html'))
      : normalize(join(rootDir, relativePath))

    // Guard against path-traversal: rootDir + path.sep ensures that a crafted
    // request like /overlays/custom-sounds_secret won't pass a bare
    // startsWith(rootDir) check when rootDir is "…/custom-sounds".
    const safeBoundary = rootDir.endsWith(sep) ? rootDir : rootDir + sep
    if (!filePath.startsWith(safeBoundary) || !existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }

    try {
      const contentType = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream'
      // These files (overlay pages, their CSS/JS) get actively edited/tuned while a
      // Browser Source is already pointed at them — OBS's embedded browser caches
      // aggressively by default, so without this a "Refresh cache of current page"
      // is needed for every change to actually show up.
      const headers: Record<string, string> = { 'Content-Type': contentType, 'Cache-Control': 'no-store' }
      // Overlay HTML pages get a CSP header to harden against injection of
      // external resources — see buildOverlayCsp().
      if (contentType.startsWith('text/html')) {
        headers['Content-Security-Policy'] = this.buildOverlayCsp()
      }

      // Binary media (images, audio) are streamed to avoid loading large files
      // entirely into memory — a user-uploaded background video can easily be
      // tens of MB. Text assets (HTML/CSS/JS/JSON) are small and read in full.
      const isBinary = contentType.startsWith('image/') || contentType.startsWith('audio/')
      if (isBinary) {
        res.writeHead(200, headers)
        createReadStream(filePath).pipe(res)
      } else {
        const data = await readFile(filePath)
        res.writeHead(200, headers)
        res.end(data)
      }
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Internal error')
    }
  }
}
