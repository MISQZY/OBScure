import { net, shell } from 'electron'
import WebSocket from 'ws'
import { BaseIntegration } from './types'
import type {
  AlertPayload,
  ChatMessagePayload,
  PointsRedemptionPayload,
  TwitchChannelStats,
  TwitchCustomReward
} from '../../shared/types'

// user:read:chat and channel:read:redemptions power the "Рулетка" event: entering
// via a chat command needs to read chat, entering via a channel-points reward
// needs to read redemptions (and list existing rewards to pick one from).
const SCOPES = 'channel:read:subscriptions moderator:read:followers user:read:chat channel:read:redemptions'

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws'
const HELIX_BASE = 'https://api.twitch.tv/helix'
const DEVICE_CODE_URL = 'https://id.twitch.tv/oauth2/device'
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

/** Baked in at build time from .env (see .env.example) — kept out of source control since it's per-deployment. */
const BUILTIN_CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID || null

/** Fallback used only until the real value arrives in session_welcome. */
const DEFAULT_KEEPALIVE_TIMEOUT_SECONDS = 10
const MIN_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 30_000

/** How long start() waits for net.isOnline() at app launch before attempting to connect anyway — see waitForOnline. */
const STARTUP_ONLINE_WAIT_MS = 8000
const STARTUP_ONLINE_POLL_MS = 250

/**
 * Signals that the stored refresh token itself is dead (expired, revoked, or
 * already consumed — Twitch rotates refresh tokens on every use, so a token
 * that's been used once by anything else, including a losing race between
 * two overlapping app instances, is invalid from then on). Retrying with the
 * SAME token can never succeed, unlike a transient network/Twitch-outage
 * failure — see handleConnectFailure, which is what actually acts on this.
 */
class TwitchAuthError extends Error {}

/**
 * Uses Electron's own net.fetch (Chromium's network stack) instead of the
 * global fetch() (Node/undici) available in the main process. They aren't
 * equivalent here: undici opens its own raw socket that bypasses the OS/
 * system proxy Chromium already knows about, and presents a different TLS
 * handshake — exactly the kind of connection a VPN, corporate proxy, or
 * antivirus SSL-inspection layer is prone to reset before it completes
 * ("Client network socket disconnected before secure TLS connection was
 * established"), while the same request over Chromium's stack — the one
 * actually configured with the system's proxy/certs, the one every browser
 * on the machine already uses successfully — goes through fine. Also still
 * catches whatever does fail and rethrows with the real cause instead of
 * fetch's bare, unhelpful "fetch failed" (surfaced straight to the user via
 * connect() → ConnectButton.tsx for the connect-failure case).
 */
async function fetchTwitch(url: string | URL, init?: RequestInit): Promise<Response> {
  try {
    return await net.fetch(url.toString(), init)
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)
    throw new Error(`Не удалось связаться с Twitch: ${cause}`)
  }
}

interface TwitchTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

interface DeviceCodeResponse {
  device_code: string
  expires_in: number
  interval: number
  user_code: string
  verification_uri: string
}

interface EventSubSession {
  id: string
  keepalive_timeout_seconds?: number
  reconnect_url?: string
}

type EventSubMessage =
  | { metadata: { message_type: 'session_welcome' }; payload: { session: EventSubSession } }
  | { metadata: { message_type: 'session_keepalive' }; payload: unknown }
  | { metadata: { message_type: 'session_reconnect' }; payload: { session: EventSubSession } }
  | {
      metadata: { message_type: 'notification' }
      payload: { subscription: { type: string }; event: Record<string, unknown> }
    }
  | { metadata: { message_type: 'revocation' }; payload: unknown }
  | { metadata: { message_type: string }; payload: unknown }

/**
 * Twitch events (subscriptions, raids, follows) via EventSub over WebSocket —
 * the same transport Twitch's own reference clients (and Streamer.bot) use
 * instead of the deprecated webhook/IRC routes.
 *
 * Auth: Device Code Grant Flow — no client secret needed (Twitch's
 * authorization-code grant always requires one, even with PKCE, which rules
 * it out for a distributed desktop app; DCF is Twitch's own answer for
 * exactly this case). connect() requests a device code, opens the consent
 * page (which shows the code pre-filled), and polls the token endpoint until
 * the user approves, the code expires, or Twitch rejects it. The refresh
 * token is persisted (encrypted), the access token stays in memory.
 *
 * Events: connect to wss://eventsub.wss.twitch.tv/ws, wait for
 * session_welcome, then use its session id to create channel.follow /
 * channel.subscribe / channel.raid subscriptions via Helix (transport:
 * websocket). Each `notification` message is mapped to an AlertPayload and
 * emitted on the event bus. A server-sent session_reconnect swaps to a new
 * socket without resubscribing (Twitch migrates subscriptions itself); a
 * missed keepalive or an unexpected close instead tears the session down and
 * reconnects from scratch with backoff.
 */
export class TwitchIntegration extends BaseIntegration {
  private socket: WebSocket | null = null
  private accessToken: string | null = null
  private accessTokenExpiresAt = 0
  private clientId: string | null = null
  private broadcasterId: string | null = null
  private keepaliveTimeoutSeconds = DEFAULT_KEEPALIVE_TIMEOUT_SECONDS
  private staleTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelayMs = MIN_RECONNECT_DELAY_MS
  private stopping = false

  /** User-supplied Client ID takes priority; otherwise fall back to the one baked into this build. */
  private getClientId(): string | null {
    return this.config.getSetting<string | null>('twitch.clientId', null) || BUILTIN_CLIENT_ID
  }

  /**
   * Deliberately does NOT await the actual connect attempt below — index.ts
   * calls `await Promise.all(Object.values(integrations).map(i => i.start()))`
   * before it ever creates the main window, so blocking here would delay the
   * whole app opening on a slow/cold network, not just Twitch's own
   * connection. The rest of this class already has full async
   * retry/reconnect machinery (see handleConnectFailure/scheduleReconnect),
   * so kicking the initial attempt off in the background and letting that
   * machinery take over is consistent with how every later reconnect already
   * behaves — it's only this first call that used to be synchronous.
   */
  async start(): Promise<void> {
    const clientId = this.getClientId()
    const refreshToken = this.config.getSecret('twitch.refreshToken')
    if (!clientId || !refreshToken) {
      console.error('[twitch] start() found nothing to reconnect with:', { hasClientId: !!clientId, hasRefreshToken: !!refreshToken })
      this.setStatus('disconnected')
      return
    }

    this.clientId = clientId
    this.stopping = false
    this.setStatus('connecting')
    void this.attemptInitialConnect(clientId, refreshToken)
  }

  private async attemptInitialConnect(clientId: string, refreshToken: string): Promise<void> {
    // App launch can race the OS network adapter still coming up — see
    // waitForOnline's doc comment for exactly what this does and doesn't cover.
    await waitForOnline(STARTUP_ONLINE_WAIT_MS)
    try {
      await this.refreshAccessToken(clientId, refreshToken)
      await this.openSession(EVENTSUB_WS_URL)
    } catch (error) {
      this.handleConnectFailure(error)
    }
  }

  /**
   * Centralizes what happens when start()/reconnect() fails to (re)establish
   * a session. A dead refresh token (TwitchAuthError) can never succeed by
   * retrying — Twitch will keep rejecting it — so this clears it and drops
   * to 'disconnected', which the UI shows as "not connected" rather than a
   * permanent, self-perpetuating "Ошибка" that retries forever with a token
   * that can never work again. Any other failure (network blip, Twitch
   * outage, EventSub hiccup) is assumed transient and keeps the existing
   * backoff-retry behavior.
   */
  private handleConnectFailure(error: unknown): void {
    if (error instanceof TwitchAuthError) {
      console.error('[twitch] refresh token rejected, dropping to disconnected:', error.message)
      this.config.deleteSecret('twitch.refreshToken')
      this.accessToken = null
      this.accessTokenExpiresAt = 0
      this.clearReconnectTimer()
      this.setStatus('disconnected')
      return
    }
    console.error('[twitch] connect failed, will retry:', error instanceof Error ? error.message : error)
    this.setStatus('error')
    this.scheduleReconnect()
  }

  stop(): void {
    this.stopping = true
    this.clearStaleTimer()
    this.clearReconnectTimer()
    this.teardownSocket(this.socket)
    this.socket = null
  }

  async connect(): Promise<void> {
    const clientId = this.getClientId()
    if (!clientId) {
      throw new Error('Сначала укажи Client ID')
    }

    this.setStatus('connecting')

    const deviceUrl = new URL(DEVICE_CODE_URL)
    deviceUrl.searchParams.set('client_id', clientId)
    deviceUrl.searchParams.set('scopes', SCOPES)

    const deviceResponse = await fetchTwitch(deviceUrl, { method: 'POST' })
    if (!deviceResponse.ok) {
      this.setStatus('error')
      throw new Error(`Twitch отклонил запрос кода устройства (${deviceResponse.status}): ${await deviceResponse.text()}`)
    }
    const device = (await deviceResponse.json()) as DeviceCodeResponse

    // verification_uri already carries the device code as a query param, so the
    // consent page shows it pre-filled — the user just has to click "Authorize".
    await shell.openExternal(device.verification_uri)

    let tokens: TwitchTokenResponse
    try {
      tokens = await this.pollForDeviceToken(clientId, device.device_code, device.interval, device.expires_in)
    } catch (error) {
      this.setStatus('error')
      throw error
    }

    this.accessToken = tokens.access_token
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000
    this.config.setSecret('twitch.refreshToken', tokens.refresh_token)
    this.clientId = clientId
    this.stopping = false

    try {
      await this.openSession(EVENTSUB_WS_URL)
    } catch (error) {
      this.setStatus('error')
      throw error
    }
  }

  /** Polls the token endpoint until the user approves on verification_uri, the device code expires, or Twitch rejects it outright. */
  private async pollForDeviceToken(
    clientId: string,
    deviceCode: string,
    intervalSeconds: number,
    expiresInSeconds: number
  ): Promise<TwitchTokenResponse> {
    const deadline = Date.now() + expiresInSeconds * 1000
    let delayMs = Math.max(intervalSeconds, 1) * 1000

    for (;;) {
      await sleep(delayMs)
      if (Date.now() >= deadline) {
        throw new Error('Время на подтверждение авторизации в Twitch истекло')
      }

      const tokenUrl = new URL('https://id.twitch.tv/oauth2/token')
      tokenUrl.searchParams.set('client_id', clientId)
      tokenUrl.searchParams.set('scopes', SCOPES)
      tokenUrl.searchParams.set('device_code', deviceCode)
      tokenUrl.searchParams.set('grant_type', DEVICE_GRANT_TYPE)

      const response = await fetchTwitch(tokenUrl, { method: 'POST' })
      if (response.ok) {
        return (await response.json()) as TwitchTokenResponse
      }

      const body = (await response.json().catch(() => null)) as { message?: string } | null
      const message = body?.message ?? ''
      if (message === 'authorization_pending') continue
      if (message === 'slow_down') {
        delayMs += 5000
        continue
      }
      throw new Error(`Twitch отклонил авторизацию устройства: ${message || response.status}`)
    }
  }

  disconnect(): void {
    this.config.deleteSecret('twitch.refreshToken')
    this.accessToken = null
    this.accessTokenExpiresAt = 0
    this.broadcasterId = null
    this.stop()
    this.setStatus('disconnected')
  }

  /** Used by start()/reconnect now, and to keep the token fresh before creating new subscriptions. */
  private async refreshAccessToken(clientId: string, refreshToken: string): Promise<void> {
    const tokenUrl = new URL('https://id.twitch.tv/oauth2/token')
    tokenUrl.searchParams.set('client_id', clientId)
    tokenUrl.searchParams.set('grant_type', 'refresh_token')
    tokenUrl.searchParams.set('refresh_token', refreshToken)

    const response = await fetchTwitch(tokenUrl, { method: 'POST' })
    if (!response.ok) {
      const body = await response.text()
      // Twitch answers a refresh token that's expired, revoked, or already
      // rotated away with a 400/401 — never a 5xx — so this is the reliable
      // signal that retrying with the SAME token is futile (see TwitchAuthError).
      if (response.status === 400 || response.status === 401) {
        throw new TwitchAuthError(`Twitch отклонил refresh-токен (${response.status}): ${body}`)
      }
      throw new Error(`Не удалось обновить токен Twitch (${response.status}): ${body}`)
    }

    const tokens = (await response.json()) as TwitchTokenResponse
    this.accessToken = tokens.access_token
    this.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000
    this.config.setSecret('twitch.refreshToken', tokens.refresh_token)
  }

  /** Opens a fresh EventSub session from scratch: connect, wait for session_welcome, then subscribe. */
  private async openSession(url: string): Promise<void> {
    const { socket, session } = await this.connectAndAwaitWelcome(url)
    await this.subscribeAll(session.id)
    this.attachSocket(socket, session.keepalive_timeout_seconds ?? DEFAULT_KEEPALIVE_TIMEOUT_SECONDS)
    this.setStatus('connected')
    this.reconnectDelayMs = MIN_RECONNECT_DELAY_MS
  }

  /** Server-initiated migration: connect to reconnect_url, and once it welcomes us, swap sockets — no resubscribe needed, Twitch carries the existing subscriptions over. */
  private async migrateSession(reconnectUrl: string): Promise<void> {
    const previousSocket = this.socket
    let migrated: { socket: WebSocket; session: EventSubSession }
    try {
      migrated = await this.connectAndAwaitWelcome(reconnectUrl)
    } catch {
      this.teardownSocket(previousSocket)
      if (this.socket === previousSocket) this.socket = null
      this.setStatus('error')
      this.scheduleReconnect()
      return
    }

    this.attachSocket(migrated.socket, migrated.session.keepalive_timeout_seconds ?? this.keepaliveTimeoutSeconds)
    this.setStatus('connected')
    this.teardownSocket(previousSocket)
  }

  private connectAndAwaitWelcome(url: string): Promise<{ socket: WebSocket; session: EventSubSession }> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      let settled = false

      const onMessage = (raw: WebSocket.RawData): void => {
        const message = parseEventSubMessage(raw)
        if (message?.metadata.message_type === 'session_welcome') {
          settled = true
          socket.off('message', onMessage)
          socket.off('close', onClose)
          socket.off('error', onError)
          resolve({ socket, session: (message as { payload: { session: EventSubSession } }).payload.session })
        }
      }
      const onClose = (): void => {
        if (settled) return
        reject(new Error('Twitch EventSub закрыл соединение до session_welcome'))
      }
      const onError = (error: Error): void => {
        if (settled) return
        reject(error)
      }

      socket.on('message', onMessage)
      socket.once('close', onClose)
      socket.once('error', onError)
    })
  }

  private attachSocket(socket: WebSocket, keepaliveTimeoutSeconds: number): void {
    this.socket = socket
    this.keepaliveTimeoutSeconds = keepaliveTimeoutSeconds
    this.resetStaleTimer()

    socket.on('message', (raw) => {
      if (this.socket !== socket) return
      this.resetStaleTimer()

      const message = parseEventSubMessage(raw)
      if (!message) return

      switch (message.metadata.message_type) {
        case 'session_reconnect': {
          const reconnectUrl = (message as { payload: { session: EventSubSession } }).payload.session
            .reconnect_url
          if (reconnectUrl) void this.migrateSession(reconnectUrl)
          break
        }
        case 'notification': {
          const { subscription, event } = (
            message as {
              payload: { subscription: { type: string }; event: Record<string, unknown> }
            }
          ).payload

          if (subscription.type === 'channel.chat.message') {
            this.eventBus.emit('chat-message', mapNotificationToChatMessage(event))
            break
          }
          if (subscription.type === 'channel.channel_points_custom_reward_redemption.add') {
            this.eventBus.emit('points-redemption', mapNotificationToPointsRedemption(event))
            break
          }
          const alert = mapNotificationToAlert(subscription.type, event)
          if (alert) this.eventBus.emit('alert', alert)
          break
        }
        default:
          break
      }
    })

    socket.on('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      this.clearStaleTimer()
      if (this.stopping) return
      this.setStatus('error')
      this.scheduleReconnect()
    })

    socket.on('error', () => {
      // 'close' always follows; the retry is driven from there.
    })
  }

  /** Twitch sends session_keepalive (or any other message) at least every keepalive_timeout_seconds; silence past that means the connection died without telling us. */
  private resetStaleTimer(): void {
    this.clearStaleTimer()
    const timeoutMs = (this.keepaliveTimeoutSeconds + 5) * 1000
    this.staleTimer = setTimeout(() => {
      const deadSocket = this.socket
      this.socket = null
      this.teardownSocket(deadSocket)
      if (this.stopping) return
      this.setStatus('error')
      this.scheduleReconnect()
    }, timeoutMs)
  }

  private clearStaleTimer(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer)
    this.staleTimer = null
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private teardownSocket(socket: WebSocket | null): void {
    if (!socket) return
    socket.removeAllListeners()
    socket.terminate()
  }

  /** Full reconnect from scratch (fresh session, fresh subscriptions) with exponential backoff — used whenever the drop wasn't a server-announced session_reconnect. */
  private scheduleReconnect(): void {
    if (this.stopping) return
    this.clearReconnectTimer()
    const delay = this.reconnectDelayMs
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS)
    this.reconnectTimer = setTimeout(() => {
      void this.reconnect()
    }, delay)
  }

  private async reconnect(): Promise<void> {
    if (this.stopping) return
    const clientId = this.clientId
    const refreshToken = this.config.getSecret('twitch.refreshToken')
    if (!clientId || !refreshToken) {
      this.setStatus('disconnected')
      return
    }

    this.setStatus('connecting')
    try {
      await this.refreshAccessToken(clientId, refreshToken)
      await this.openSession(EVENTSUB_WS_URL)
    } catch (error) {
      this.handleConnectFailure(error)
    }
  }

  private async fetchBroadcasterId(): Promise<string> {
    if (this.broadcasterId) return this.broadcasterId
    if (!this.clientId || !this.accessToken) {
      throw new Error('Нет токена Twitch для запроса профиля')
    }

    const response = await fetchTwitch(`${HELIX_BASE}/users`, {
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Client-Id': this.clientId }
    })
    if (!response.ok) {
      throw new Error(`Не удалось получить профиль Twitch (${response.status})`)
    }

    const body = (await response.json()) as { data: Array<{ id: string }> }
    const id = body.data[0]?.id
    if (!id) {
      throw new Error('Twitch не вернул профиль пользователя')
    }
    this.broadcasterId = id
    return id
  }

  /**
   * Whether `userId` currently has an active subscription to this channel —
   * used to gate roulette entries in "subscribers" entry mode (see
   * isEligibleForRoulette in index.ts, used for both chat and points-based
   * entries). GET /subscriptions with a user_id filter returns a match only
   * if that user is subscribed, so a non-empty `data` is the whole answer.
   */
  async isSubscriber(userId: string): Promise<boolean> {
    if (!this.clientId || !this.accessToken || !userId) return false
    const broadcasterId = await this.fetchBroadcasterId()
    const response = await fetchTwitch(`${HELIX_BASE}/subscriptions?broadcaster_id=${broadcasterId}&user_id=${userId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Client-Id': this.clientId }
    })
    if (!response.ok) return false
    const body = (await response.json()) as { data: unknown[] }
    return body.data.length > 0
  }

  /**
   * Whether `userId` currently follows the channel — same shape as
   * isSubscriber, for roulette's "followers" entry mode. Twitch's chat
   * badges have no follower badge (unlike subscriber/founder), so unlike
   * subscriber status this can't be read off a chat message for free; every
   * caller goes through this Helix lookup regardless of entry source.
   */
  async isFollower(userId: string): Promise<boolean> {
    if (!this.clientId || !this.accessToken || !userId) return false
    const broadcasterId = await this.fetchBroadcasterId()
    const response = await fetchTwitch(`${HELIX_BASE}/channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Client-Id': this.clientId }
    })
    if (!response.ok) return false
    const body = (await response.json()) as { data: unknown[] }
    return body.data.length > 0
  }

  /** Lists the channel's existing custom point rewards — used to populate the "Рулетка" reward picker. Rewards are created/managed from the Twitch dashboard itself, not this app. */
  async getCustomRewards(): Promise<TwitchCustomReward[]> {
    if (!this.clientId || !this.accessToken) return []
    const broadcasterId = await this.fetchBroadcasterId()
    const response = await fetchTwitch(`${HELIX_BASE}/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Client-Id': this.clientId }
    })
    if (!response.ok) return []
    const body = (await response.json()) as { data: Array<{ id: string; title: string }> }
    return body.data.map((reward) => ({ id: reward.id, title: reward.title }))
  }

  /**
   * Stats for the dashboard's Twitch card: live status/viewers/title/category
   * from Get Streams, plus follower and subscriber totals. No "average
   * viewers" here — Twitch only surfaces that in its own dashboard via
   * private analytics, not through Helix. Each sub-request degrades to null
   * independently on failure (e.g. subscriber totals 400 for channels not
   * eligible for subs) rather than failing the whole call.
   */
  async getChannelStats(): Promise<TwitchChannelStats | null> {
    if (!this.clientId || !this.accessToken) return null
    const broadcasterId = await this.fetchBroadcasterId()
    const headers = { Authorization: `Bearer ${this.accessToken}`, 'Client-Id': this.clientId, 'Cache-Control': 'no-cache' }
    // net.fetch runs over Chromium's network stack, which (unlike Node's
    // fetch) keeps a real HTTP cache and can serve a private GET straight
    // from it — see the identical issue (and fix) in SpotifyIntegration.poll.
    // The `_` param busts the cache key itself regardless of whether
    // anything along the way honors the header.
    const bust = `_=${Date.now()}`
    const init = { headers }

    const [streamResponse, followersResponse, subsResponse] = await Promise.all([
      fetchTwitch(`${HELIX_BASE}/streams?user_id=${broadcasterId}&${bust}`, init),
      fetchTwitch(`${HELIX_BASE}/channels/followers?broadcaster_id=${broadcasterId}&${bust}`, init),
      fetchTwitch(`${HELIX_BASE}/subscriptions?broadcaster_id=${broadcasterId}&first=1&${bust}`, init)
    ])

    const stream = streamResponse.ok
      ? (
          (await streamResponse.json()) as {
            data: Array<{ viewer_count: number; title: string; game_name: string; started_at: string }>
          }
        ).data[0]
      : undefined
    const followers = followersResponse.ok ? ((await followersResponse.json()) as { total?: number }) : {}
    const subs = subsResponse.ok ? ((await subsResponse.json()) as { total?: number }) : {}

    return {
      isLive: Boolean(stream),
      viewerCount: stream ? stream.viewer_count : null,
      title: stream ? stream.title : null,
      gameName: stream ? stream.game_name || null : null,
      startedAt: stream ? stream.started_at : null,
      followerCount: typeof followers.total === 'number' ? followers.total : null,
      subscriberCount: typeof subs.total === 'number' ? subs.total : null
    }
  }

  private async subscribeAll(sessionId: string): Promise<void> {
    const broadcasterId = await this.fetchBroadcasterId()
    const subscriptions: Array<{ type: string; version: string; condition: Record<string, string> }> = [
      { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: broadcasterId } },
      { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: broadcasterId } },
      {
        type: 'channel.follow',
        version: '2',
        condition: { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId }
      },
      {
        type: 'channel.chat.message',
        version: '1',
        condition: { broadcaster_user_id: broadcasterId, user_id: broadcasterId }
      },
      {
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: { broadcaster_user_id: broadcasterId }
      }
    ]

    for (const subscription of subscriptions) {
      await this.createSubscription(subscription.type, subscription.version, subscription.condition, sessionId)
    }
  }

  private async createSubscription(
    type: string,
    version: string,
    condition: Record<string, string>,
    sessionId: string
  ): Promise<void> {
    if (!this.clientId || !this.accessToken) {
      throw new Error('Нет токена Twitch для подписки на события')
    }

    const response = await fetchTwitch(`${HELIX_BASE}/eventsub/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Client-Id': this.clientId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type, version, condition, transport: { method: 'websocket', session_id: sessionId } })
    })

    // 409 = this session is already subscribed (harmless — happens if a subscribe retries after a partial failure).
    if (!response.ok && response.status !== 409) {
      throw new Error(`Twitch отклонил подписку на ${type} (${response.status})`)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Waits (up to timeoutMs) for net.isOnline() to report true before giving up
 * and returning anyway. Guards against the specific race where start() runs
 * right at app launch, before the OS network adapter has finished
 * associating (common a few seconds after boot/login) — connecting at that
 * point fails outright rather than just being slow, so handleConnectFailure
 * would log an error and burn through its first retry for a condition that
 * was always going to clear on its own in a second or two.
 *
 * This does NOT catch the other well-documented cause of the same failure
 * message (a VPN/AV SSL-inspection layer that's slower to warm up than the
 * OS network stack — see fetchTwitch's doc comment): net.isOnline() reports
 * true as soon as basic connectivity exists, which it typically does well
 * before such a layer is ready to intercept a specific TLS handshake. For
 * that case the existing exponential-backoff retry in handleConnectFailure
 * is still what actually recovers the connection.
 */
async function waitForOnline(timeoutMs: number): Promise<void> {
  if (net.isOnline()) return
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(STARTUP_ONLINE_POLL_MS)
    if (net.isOnline()) return
  }
}

function parseEventSubMessage(raw: WebSocket.RawData): EventSubMessage | null {
  try {
    return JSON.parse(raw.toString()) as EventSubMessage
  } catch {
    return null
  }
}

function mapNotificationToAlert(type: string, event: Record<string, unknown>): AlertPayload | null {
  switch (type) {
    case 'channel.follow':
      return { source: 'twitch', type: 'follow', user: stringField(event, 'user_name', 'user_login') }
    case 'channel.subscribe':
      return { source: 'twitch', type: 'subscription', user: stringField(event, 'user_name', 'user_login') }
    case 'channel.raid':
      return {
        source: 'twitch',
        type: 'raid',
        user: stringField(event, 'from_broadcaster_user_name', 'from_broadcaster_user_login'),
        amount: typeof event.viewers === 'number' ? event.viewers : undefined
      }
    default:
      return null
  }
}

function stringField(event: Record<string, unknown>, primary: string, fallback: string): string {
  const value = event[primary] ?? event[fallback]
  return typeof value === 'string' ? value : '???'
}

function mapNotificationToChatMessage(event: Record<string, unknown>): ChatMessagePayload {
  const message = event.message
  const text =
    message && typeof message === 'object' && typeof (message as Record<string, unknown>).text === 'string'
      ? ((message as Record<string, unknown>).text as string)
      : ''
  return {
    source: 'twitch',
    user: stringField(event, 'chatter_user_name', 'chatter_user_login'),
    userId: typeof event.chatter_user_id === 'string' ? event.chatter_user_id : '',
    text
  }
}

function mapNotificationToPointsRedemption(event: Record<string, unknown>): PointsRedemptionPayload {
  const reward = event.reward
  const rewardObj = reward && typeof reward === 'object' ? (reward as Record<string, unknown>) : {}
  return {
    source: 'twitch',
    user: stringField(event, 'user_name', 'user_login'),
    userId: typeof event.user_id === 'string' ? event.user_id : '',
    rewardId: typeof rewardObj.id === 'string' ? rewardObj.id : '',
    rewardTitle: typeof rewardObj.title === 'string' ? rewardObj.title : ''
  }
}
