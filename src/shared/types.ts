export interface NowPlayingPayload {
  source: 'spotify' | 'windows'
  title: string
  artist: string
  albumArt?: string
  isPlaying: boolean
}

export type AlertType = 'subscription' | 'raid' | 'follow' | 'membership' | 'super-chat'

/** Every type a Twitch/YouTube alert can be — still meaningful without a standalone Alerts overlay: a custom overlay's Event node (see nodes/index.tsx EventNode) reacts to these directly. */
export const ALERT_TYPES: AlertType[] = ['subscription', 'raid', 'follow', 'membership', 'super-chat']

export interface CustomOverlay {
  id: string
  name: string
  /** Unique key used to build this scene's OBS overlay URL — editable independently of `id`/`name`. */
  urlKey: string
  nodes: any[]
  edges: any[]
}

export interface AlertPayload {
  source: 'twitch' | 'youtube'
  type: AlertType
  user: string
  message?: string
  amount?: number
}

/** Provably-fair random roll: `hash` (SHA-256 of `seed`) is published at 'committed' — before `seed`/`number` are known — so viewers can verify afterwards that the result wasn't changed after the fact. See RandomEngine. */
export interface RandomStatePayload {
  phase: 'idle' | 'committed' | 'revealed'
  hash: string | null
  numbers: number[] | null
  seed: string | null
  min: number
  max: number
  count: number
}

export type RouletteEntrantSource = 'chat' | 'points' | 'manual'

export interface RouletteEntrant {
  id: string
  name: string
  source: RouletteEntrantSource
  /** Entries this viewer holds in the round. Chat/manual entries stay at 1; each points-reward redemption adds another, so repeat redemptions buy better odds. */
  weight: number
}

export interface RouletteStatePayload {
  phase: 'idle' | 'collecting' | 'spinning' | 'result'
  entrants: RouletteEntrant[]
  /** epoch ms the 'collecting' phase ends at; null outside that phase. */
  endsAt: number | null
  winner: RouletteEntrant | null
  /** SHA-256(seed), published as soon as the round starts — before any entrant joins. */
  hash: string | null
  /** Disclosed once collecting ends (spinning/result phases); null while still collecting. */
  seed: string | null
}

export interface ChatMessagePayload {
  source: 'twitch'
  user: string
  /** Twitch numeric user id — used to check follower/subscriber status for roulette's entry mode (see isEligibleForRoulette in index.ts); neither status can be read off the message itself for free. */
  userId: string
  text: string
}

export interface PointsRedemptionPayload {
  source: 'twitch'
  user: string
  /** Twitch numeric user id — same role as ChatMessagePayload's, for the same entry-mode check on a points-based entry. */
  userId: string
  rewardId: string
  rewardTitle: string
}

export interface TwitchCustomReward {
  id: string
  title: string
}

export interface AppEvents {
  'now-playing': NowPlayingPayload
  alert: AlertPayload
  'random-state': RandomStatePayload
  'roulette-state': RouletteStatePayload
  'chat-message': ChatMessagePayload
  'points-redemption': PointsRedemptionPayload
  'custom-overlay-config': CustomOverlay[]
  /** Tells connected custom-scene pages to actually play: replay entrance animations and fire any non-repeating Background FX once. Sent by the Scene Builder's Test button — see OverlayServer.testCustomOverlay. */
  'custom-overlay-trigger': { urlKey: string }
  'integration-status': { key: IntegrationKey; status: string }
}

export interface OverlayAddress {
  host: string
  port: number
}

/** Custom overlays (Scene Builder scenes) are the only overlay type served over HTTP/OBS Browser Source now — see OverlayServer. */
export interface OverlayUrls extends OverlayAddress {
  /** Base URL a custom scene's Browser Source is built from as `${customBase}/${urlKey}.html` — see OverlayServer.handleRequest. */
  customBase: string
}

export type IntegrationKey = 'spotify' | 'windowsMedia' | 'twitch' | 'youtube'
export type IntegrationsStatusMap = Record<IntegrationKey, string>

/** Plain (non-secret) config keys editable from the Integrations settings pages. */
export type SettingKey =
  | 'spotify.clientId'
  | 'windowsMedia.enabled'
  | 'twitch.clientId'
  | 'youtube.clientId'
  | 'youtube.clientSecret'
  | 'overlay.host'
  | 'overlay.port'
  | 'customOverlays'
  | 'customThemes'
  | 'customLocales'

export interface ConnectResult {
  ok: boolean
  error?: string
}

/**
 * Channel stats shown on the dashboard's Twitch card. Only fields Helix
 * actually exposes — Twitch's own creator dashboard also shows things like
 * average viewers, but that comes from private analytics with no public API,
 * so it's deliberately not modeled here.
 */
export interface TwitchChannelStats {
  isLive: boolean
  viewerCount: number | null
  title: string | null
  gameName: string | null
  startedAt: string | null
  followerCount: number | null
  subscriberCount: number | null
}
