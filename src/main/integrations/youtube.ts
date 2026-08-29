import { net, shell } from 'electron'
import { BaseIntegration } from './types'
import { waitForRedirect } from '../oauth/callbackServer'
import { generateState } from '../oauth/pkce'

const REDIRECT_PORT = 47891
const REDIRECT_PATH = '/callback/youtube'
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}${REDIRECT_PATH}`
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly'

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
async function fetchYoutube(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await net.fetch(url, init)
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)
    throw new Error(`Не удалось связаться с YouTube: ${cause}`)
  }
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

/**
 * YouTube Live events (memberships, Super Chats, ...).
 *
 * Auth: Google OAuth Authorization Code with a loopback redirect (Google's
 * "Desktop app" client type doesn't require pre-registering the exact
 * redirect URI). Requires access_type=offline + prompt=consent to actually
 * get a refresh token back. connect() opens the system browser and
 * completes via a one-shot loopback HTTP server; the refresh token is
 * persisted (encrypted), the access token stays in memory.
 *
 * Important limitation: YouTube has no equivalent of a Twitch "raid" and no
 * push/webhook API for chat/membership events — everything goes through
 * polling.
 *
 * Still TODO: resolve the active liveChatId via liveBroadcasts.list, then
 * poll liveChatMessages.list on the interval the API returns, filter for
 * membership/superchat events, and emit(eventBus, 'alert', { source: 'youtube', ... }).
 */
export class YoutubeIntegration extends BaseIntegration {
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private accessToken: string | null = null
  private accessTokenExpiresAt = 0

  async start(): Promise<void> {
    const clientId = this.config.getSetting<string | null>('youtube.clientId', null)
    const clientSecret = this.config.getSetting<string | null>('youtube.clientSecret', null)
    const refreshToken = this.config.getSecret('youtube.refreshToken')
    if (!clientId || !clientSecret || !refreshToken) {
      this.setStatus('disconnected')
      return
    }

    try {
      await this.refreshAccessToken(clientId, clientSecret, refreshToken)
      this.setStatus('connected')
    } catch {
      this.setStatus('error')
    }
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  async connect(): Promise<void> {
    const clientId = this.config.getSetting<string | null>('youtube.clientId', null)
    const clientSecret = this.config.getSetting<string | null>('youtube.clientSecret', null)
    if (!clientId || !clientSecret) {
      throw new Error('Сначала укажи Client ID и Client Secret')
    }

    this.setStatus('connecting')
    const state = generateState()

    const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authorizeUrl.searchParams.set('client_id', clientId)
    authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('scope', SCOPES)
    authorizeUrl.searchParams.set('access_type', 'offline')
    authorizeUrl.searchParams.set('prompt', 'consent')
    authorizeUrl.searchParams.set('state', state)

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
      throw new Error(`Google отклонил авторизацию: ${authError}`)
    }
    const code = params.get('code')
    if (!code) {
      this.setStatus('error')
      throw new Error('Google не вернул код авторизации')
    }

    const tokenResponse = await fetchYoutube('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: clientSecret
      })
    })

    if (!tokenResponse.ok) {
      this.setStatus('error')
      throw new Error(`Google отклонил обмен токена (${tokenResponse.status})`)
    }

    const tokens = (await tokenResponse.json()) as GoogleTokenResponse
    if (!tokens.refresh_token) {
      this.setStatus('error')
      throw new Error('Google не выдал refresh token — отзови доступ приложению в аккаунте Google и попробуй снова')
    }

    this.accessToken = tokens.access_token
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000
    this.config.setSecret('youtube.refreshToken', tokens.refresh_token)
    this.setStatus('connected')
  }

  disconnect(): void {
    this.config.deleteSecret('youtube.refreshToken')
    this.accessToken = null
    this.accessTokenExpiresAt = 0
    this.setStatus('disconnected')
    this.stop()
  }

  /** Used by start() now, and will be reused by the live-chat poller once implemented. */
  private async refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<void> {
    const response = await fetchYoutube('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
      })
    })

    if (!response.ok) {
      throw new Error(`Не удалось обновить токен Google (${response.status})`)
    }

    const tokens = (await response.json()) as GoogleTokenResponse
    this.accessToken = tokens.access_token
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000
  }
}
