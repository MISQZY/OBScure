import { net } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NowPlayingPayload } from '../shared/types'

const TITLE_FILE = 'title.txt'
const ARTIST_FILE = 'artist.txt'
const STATUS_FILE = 'status.txt'
const COVER_FILE = 'cover'

/**
 * Disk-backed "now playing" cache, same idea as OBS's Tuna plugin: title,
 * artist and status live in their own .txt files under userData, cover art
 * in an image file, all rewritten only when the track actually changes —
 * not on every poll tick (Spotify/Windows Media already dedupe before
 * emitting, see their pollers' lastKey checks).
 *
 * The cover art rewrite is what this class actually buys over just piping
 * the raw NowPlayingPayload to the renderer: resolve() downloads it once per
 * track and hands back a data: URI instead of the original (Spotify CDN)
 * URL, so the dashboard's <img> never makes its own network request — no
 * repeated hotlinking, no dependency on img-src allowing a third-party host.
 */
export class NowPlayingCache {
  private readonly dir: string
  /** Called with a re-resolved payload once a cover download that missed the initial resolve() finishes — see resolve()'s doc comment. */
  private readonly onCoverReady?: (payload: NowPlayingPayload) => void
  private lastKey = ''
  private lastPayload: NowPlayingPayload | null = null
  /** The art URL a download has been attempted for, success or failure — see downloadCover's doc comment on why this is set before the fetch even resolves. */
  private attemptedCoverUrl: string | null = null
  private cachedCoverDataUri: string | undefined

  constructor(baseDir: string, onCoverReady?: (payload: NowPlayingPayload) => void) {
    this.dir = join(baseDir, 'now-playing')
    this.onCoverReady = onCoverReady
  }

  /** Drops in-memory dedup state so the next resolve() rewrites everything from scratch — used on profile switch, where a stale cache would otherwise mask the new profile's actual now-playing state. */
  reset(): void {
    this.lastKey = ''
    this.lastPayload = null
    this.attemptedCoverUrl = null
    this.cachedCoverDataUri = undefined
  }

  /**
   * Returns immediately with whatever cover is already cached — never waits
   * on a network download. A slow or failing fetch (e.g. flaky VPN/AV SSL
   * interception hitting Spotify's CDN — see fetchSpotify's doc comment in
   * spotify.ts) would otherwise delay a title/artist update that has
   * nothing to do with the image. A newly-changed cover downloads in the
   * background and reaches the renderer via onCoverReady once it's ready.
   */
  resolve(payload: NowPlayingPayload): NowPlayingPayload {
    this.ensureDir()

    const key = `${payload.source}|${payload.title}|${payload.artist}|${payload.isPlaying}`
    if (key !== this.lastKey) {
      this.lastKey = key
      writeFileSync(join(this.dir, TITLE_FILE), payload.title, 'utf8')
      writeFileSync(join(this.dir, ARTIST_FILE), payload.artist, 'utf8')
      writeFileSync(join(this.dir, STATUS_FILE), payload.isPlaying ? 'Playing' : 'Paused', 'utf8')
    }

    if (!payload.albumArt) {
      this.attemptedCoverUrl = null
      this.cachedCoverDataUri = undefined
    } else if (payload.albumArt.startsWith('data:')) {
      // Windows Media hands back an already-decoded data: URI (no CDN URL to
      // fetch — see WindowsMediaIntegration) — nothing to download, just cache it.
      this.attemptedCoverUrl = payload.albumArt
      this.cachedCoverDataUri = payload.albumArt
      this.writeCoverFile(payload.albumArt)
    } else if (payload.albumArt !== this.attemptedCoverUrl) {
      this.attemptedCoverUrl = payload.albumArt
      void this.downloadCover(payload.albumArt)
    }

    const resolved = { ...payload, albumArt: this.cachedCoverDataUri }
    this.lastPayload = resolved
    return resolved
  }

  /**
   * Marks the URL as attempted before the fetch even starts (not just on
   * success): otherwise a host that's failing the TLS handshake — the exact
   * failure mode this app's network sits behind for some users — gets
   * retried on every single poll tick, spamming the same handshake error
   * every few seconds for a cover that was never going to load anyway. One
   * attempt per track is enough; a real track change resets attemptedCoverUrl
   * via resolve() above.
   */
  private async downloadCover(url: string): Promise<void> {
    try {
      const response = await net.fetch(url)
      if (!response.ok) return
      const buffer = Buffer.from(await response.arrayBuffer())
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      this.writeCoverFile(`data:${contentType};base64,${buffer.toString('base64')}`)

      // Only push a follow-up if this download is still the current track's
      // art — it may have already changed again while this fetch was in flight.
      if (this.attemptedCoverUrl === url && this.lastPayload) {
        this.lastPayload = { ...this.lastPayload, albumArt: this.cachedCoverDataUri }
        this.onCoverReady?.(this.lastPayload)
      }
    } catch {
      // Keep whatever cover we already had rather than blank it on a failed download.
    }
  }

  /** Decodes a `data:<mime>;base64,<data>` URI onto disk as cover.<ext> and caches it in memory, same end state whichever source (Spotify's CDN download or Windows Media's inline thumbnail) produced it. */
  private writeCoverFile(dataUri: string): void {
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri)
    if (!match) return
    const [, contentType, base64] = match
    const extension = contentType.split('/')[1]?.split(';')[0] || 'jpg'
    writeFileSync(join(this.dir, `${COVER_FILE}.${extension}`), Buffer.from(base64, 'base64'))
    this.cachedCoverDataUri = dataUri
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
  }
}
