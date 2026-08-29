import { net, shell } from 'electron'
import { BaseIntegration } from './types'
import { waitForRedirect } from '../oauth/callbackServer'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../oauth/pkce'

const REDIRECT_PORT = 47891
const REDIRECT_PATH = '/callback/spotify'
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}${REDIRECT_PATH}`
const SCOPES = 'user-read-currently-playing user-read-playback-state'
const POLL_INTERVAL_MS = 5000
/** Refresh a bit before actual expiry so a poll never races a token that just went stale. */
const TOKEN_REFRESH_SKEW_MS = 5000

/**
 * Electron's own net.fetch (Chromium's network stack) instead of the global
 * fetch() (Node/undici) available in the main process — undici opens its own
 * raw socket that bypasses the OS/system proxy Chromium already knows about
 * and presents a different TLS handshake, which a VPN, corporate proxy, or
 * antivirus SSL-inspection layer is prone to reset before it completes. See
 * the identical fetchTwitch in integrations/twitch.ts, where a user actually
 * hit this ("Client network socket disconnected before secure TLS connection
 * was established") — same underlying cause, so applied consistently here.
 */
async function fetchSpotify(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await net.fetch(url, init)
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)
    throw new Error(`Не удалось связаться со Spotify: ${cause}`)
  }
}

interface SpotifyTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

interface SpotifyCurrentlyPlaying {
  is_playing: boolean
  item: {
    name: string
    artists: Array<{ name: string }>
    album: { images: Array<{ url: string }> }
  } | null
}

/**
 * Spotify now-playing via the official Web API.
 *
 * Auth: Authorization Code + PKCE — no client secret needed (safe for a
 * desktop app). connect() opens the system browser and completes via a
 * one-shot loopback HTTP server; the refresh token is the only thing
 * persisted (encrypted), the access token stays in memory and is renewed
 * through refreshAccessToken().
 *
 * Polls GET /v1/me/player/currently-playing every POLL_INTERVAL_MS and emits
 * 'now-playing' only when the track or play state actually changes — same
 * change-detection shape as WindowsMediaIntegration's SMTC poller.
 */
export class SpotifyIntegration extends BaseIntegration {
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private accessToken: string | null = null
  private accessTokenExpiresAt = 0
  private lastKey = ''
  private lastLoggedStatus = 0

  async start(): Promise<void> {
    const clientId = this.config.getSetting<string | null>('spotify.clientId', null)
    const refreshToken = this.config.getSecret('spotify.refreshToken')
    if (!clientId || !refreshToken) {
      this.setStatus('disconnected')
      return
    }

    try {
      await this.refreshAccessToken(clientId, refreshToken)
      this.setStatus('connected')
      this.startPolling()
    } catch {
      this.setStatus('error')
    }
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.lastKey = ''
  }

  private startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    void this.poll()
    this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
  }

  /**
   * Fetches the currently-playing track and emits 'now-playing' on change.
   * Any failure (expired refresh token, transient network hiccup, Spotify
   * outage) just skips this tick rather than flipping status — same
   * pragmatic handling as WindowsMediaIntegration.poll, since a poller
   * failure isn't a connection failure the way the initial start()/connect()
   * refresh is.
   */
  private async poll(): Promise<void> {
    const clientId = this.config.getSetting<string | null>('spotify.clientId', null)
    const refreshToken = this.config.getSecret('spotify.refreshToken')
    if (!clientId || !refreshToken) return

    try {
      if (!this.accessToken || Date.now() >= this.accessTokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
        await this.refreshAccessToken(clientId, refreshToken)
      }

      // net.fetch runs over Chromium's network stack, which — unlike Node's
      // fetch — keeps a real HTTP cache and will happily serve a private
      // (Authorization-bearing) GET from it if nothing along the way sends a
      // strict no-store, including a proxy/AV SSL-inspection layer that
      // drops or rewrites Spotify's own cache headers (this app's network
      // already has one, see fetchSpotify's doc comment — same environment
      // that produces the SSL handshake failures logged elsewhere). Without
      // this, a poll can silently keep re-serving the first cached response
      // forever — the track looks frozen even though playback has moved on
      // and every later request "succeeded". The `_` query param busts the
      // cache key itself (works even if a proxy strips Cache-Control), the
      // header is belt-and-suspenders for anything that keys on it instead.
      const response = await fetchSpotify(`https://api.spotify.com/v1/me/player/currently-playing?_=${Date.now()}`, {
        headers: { Authorization: `Bearer ${this.accessToken}`, 'Cache-Control': 'no-cache' }
      })

      let isPlaying = false
      let title = ''
      let artist = ''
      let albumArt: string | undefined
      if (response.status === 200) {
        const body = (await response.json()) as SpotifyCurrentlyPlaying
        isPlaying = body.is_playing
        title = body.item?.name ?? ''
        artist = body.item?.artists.map((a) => a.name).join(', ') ?? ''
        albumArt = body.item?.album.images[0]?.url
      } else {
        // Anything else — most commonly 204 (no active playback context) —
        // skips this tick instead of clearing the track. Spotify drops the
        // context (and with it title/artist/art) after the device sits
        // paused for a while, well before the user thinks of it as
        // "stopped"; clearing the dashboard's card at that point would make
        // it look like the pause itself broke the card. Keep showing the
        // last known track instead (Tuna does the same) — a genuinely new
        // 200 response is what moves it forward.
        //
        // Logged (once per distinct status, not every tick) because this
        // branch is otherwise invisible: if Spotify starts answering
        // something other than 200 on every poll — 204 that never clears,
        // 429 from polling too aggressively, a stale 401 — the dashboard
        // just looks frozen on the last track with nothing in the console
        // to say why.
        if (response.status !== this.lastLoggedStatus) {
          this.lastLoggedStatus = response.status
          console.error(`[spotify] now-playing poll got HTTP ${response.status} instead of 200 — track will stay frozen until this clears`)
        }
        return
      }
      this.lastLoggedStatus = 0

      if (!title && !artist) return

      const key = `${isPlaying}|${title}|${artist}`
      if (key === this.lastKey) return
      this.lastKey = key

      this.eventBus.emit('now-playing', { source: 'spotify', title, artist, albumArt, isPlaying })
    } catch (error) {
      // Skip this tick (see doc comment above) — but still log it. A poller
      // that silently fails every tick (e.g. refreshAccessToken() failing
      // the same SSL handshake the rest of this app's Spotify/Twitch calls
      // are prone to under some VPN/AV setups) looks from the dashboard like
      // the track is frozen, with nothing in the UI to say why.
      console.error('[spotify] now-playing poll failed:', error instanceof Error ? error.message : error)
    }
  }

  async connect(): Promise<void> {
    const clientId = this.config.getSetting<string | null>('spotify.clientId', null)
    if (!clientId) {
      throw new Error('Сначала укажи Client ID')
    }

    this.setStatus('connecting')

    const verifier = generateCodeVerifier()
    const challenge = generateCodeChallenge(verifier)
    const state = generateState()

    const authorizeUrl = new URL('https://accounts.spotify.com/authorize')
    authorizeUrl.searchParams.set('client_id', clientId)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authorizeUrl.searchParams.set('code_challenge_method', 'S256')
    authorizeUrl.searchParams.set('code_challenge', challenge)
    authorizeUrl.searchParams.set('state', state)
    authorizeUrl.searchParams.set('scope', SCOPES)

    const redirectPromise = waitForRedirect({ port: REDIRECT_PORT, path: REDIRECT_PATH })
    await shell.openExternal(authorizeUrl.toString())

    let params: URLSearchParams
    try {
      params = await redirectPromise
    } catch (error) {
      this.setStatus('error')
      throw error
    }

    if (params.get('state') !== state) {
      this.setStatus('error')
      throw new Error('OAuth state не совпадает — возможна подмена запроса')
    }
    const authError = params.get('error')
    if (authError) {
      this.setStatus('error')
      throw new Error(`Spotify отклонил авторизацию: ${authError}`)
    }
    const code = params.get('code')
    if (!code) {
      this.setStatus('error')
      throw new Error('Spotify не вернул код авторизации')
    }

    const tokenResponse = await fetchSpotify('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier
      })
    })

    if (!tokenResponse.ok) {
      this.setStatus('error')
      throw new Error(`Spotify отклонил обмен токена (${tokenResponse.status})`)
    }

    const tokens = (await tokenResponse.json()) as SpotifyTokenResponse
    if (!tokens.refresh_token) {
      this.setStatus('error')
      throw new Error('Spotify не выдал refresh token')
    }

    this.accessToken = tokens.access_token
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000
    this.config.setSecret('spotify.refreshToken', tokens.refresh_token)
    this.setStatus('connected')
    this.startPolling()
  }

  disconnect(): void {
    this.config.deleteSecret('spotify.refreshToken')
    this.accessToken = null
    this.accessTokenExpiresAt = 0
    this.setStatus('disconnected')
    this.stop()
  }

  /** Used by start() now, and will be reused by the now-playing poller once implemented. */
  private async refreshAccessToken(clientId: string, refreshToken: string): Promise<void> {
    const response = await fetchSpotify('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId
      })
    })

    if (!response.ok) {
      throw new Error(`Не удалось обновить токен Spotify (${response.status})`)
    }

    const tokens = (await response.json()) as SpotifyTokenResponse
    this.accessToken = tokens.access_token
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000
    if (tokens.refresh_token) {
      this.config.setSecret('spotify.refreshToken', tokens.refresh_token)
    }
  }
}
