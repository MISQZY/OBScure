import { net } from "electron";
import WebSocket from "ws";

export const EVENTSUB_WS_URL = "wss://eventsub.wss.twitch.tv/ws";
export const HELIX_BASE = "https://api.twitch.tv/helix";
export const DEVICE_CODE_URL = "https://id.twitch.tv/oauth2/device";
export const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
export const SCOPES =
  "channel:read:subscriptions moderator:read:followers user:read:chat channel:read:redemptions";

export const BUILTIN_CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID || null;

export const DEFAULT_KEEPALIVE_TIMEOUT_SECONDS = 10;
export const MIN_RECONNECT_DELAY_MS = 1000;
export const MAX_RECONNECT_DELAY_MS = 30_000;
export const STARTUP_ONLINE_WAIT_MS = 8000;
export const STARTUP_ONLINE_POLL_MS = 250;

export class TwitchAuthError extends Error {}

export async function fetchTwitch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await net.fetch(url.toString(), init);
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : String(error);
    throw new Error(`Failed to reach Twitch: ${cause}`);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForOnline(timeoutMs: number): Promise<void> {
  if (net.isOnline()) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(STARTUP_ONLINE_POLL_MS);
    if (net.isOnline()) return;
  }
}

export function parseEventSubMessage(
  raw: WebSocket.RawData,
): EventSubMessage | null {
  try {
    return JSON.parse(raw.toString()) as EventSubMessage;
  } catch {
    return null;
  }
}

export interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface DeviceCodeResponse {
  device_code: string;
  expires_in: number;
  interval: number;
  user_code: string;
  verification_uri: string;
}

export interface EventSubSession {
  id: string;
  keepalive_timeout_seconds?: number;
  reconnect_url?: string;
}

export type EventSubMessage =
  | {
      metadata: { message_type: "session_welcome" };
      payload: { session: EventSubSession };
    }
  | { metadata: { message_type: "session_keepalive" }; payload: unknown }
  | {
      metadata: { message_type: "session_reconnect" };
      payload: { session: EventSubSession };
    }
  | {
      metadata: { message_type: "notification" };
      payload: {
        subscription: { type: string };
        event: Record<string, unknown>;
      };
    }
  | { metadata: { message_type: "revocation" }; payload: unknown }
  | { metadata: { message_type: string }; payload: unknown };
