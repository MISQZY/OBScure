import { createHash } from "node:crypto";
import type { StreamerBotGlobalVariable } from "../../../shared/types";

/**
 * Streamer.bot's WebSocket auth handshake (see docs.streamer.bot/api/websocket/guide/authentication):
 * on connect the server immediately sends a Hello message; if its own
 * `authentication` field is present, the client must reply with an
 * Authenticate request carrying this string, computed as:
 *   1. secret = base64(sha256(password + salt))
 *   2. authentication = base64(sha256(secret + challenge))
 * No password is ever sent in the clear — same challenge-response shape as
 * OBS's own websocket protocol, just single- rather than double-hashed.
 */
export function computeAuthString(
  password: string,
  salt: string,
  challenge: string,
): string {
  const secret = createHash("sha256")
    .update(password + salt)
    .digest("base64");
  return createHash("sha256")
    .update(secret + challenge)
    .digest("base64");
}

export interface StreamerBotHelloMessage {
  request: "Hello";
  timestamp: string;
  session: string;
  authentication?: { salt: string; challenge: string };
}

export function isHelloMessage(
  message: unknown,
): message is StreamerBotHelloMessage {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { request?: unknown }).request === "Hello"
  );
}

export interface StreamerBotResponseEnvelope {
  id?: string;
  status?: "ok" | "error";
  [key: string]: unknown;
}

/** A pushed (unsolicited) event — has no `id` matching a pending request, carries `event.source`/`event.type` instead. See docs.streamer.bot/api/websocket/guide/events. */
export interface StreamerBotEventEnvelope {
  timeStamp: string;
  event: { source: string; type: string };
  data: unknown;
  [key: string]: unknown;
}

export function isEventEnvelope(
  message: Record<string, unknown>,
): message is StreamerBotEventEnvelope {
  return (
    typeof message.event === "object" &&
    message.event !== null &&
    "source" in (message.event as object)
  );
}

/** Command.Triggered's own event.data shape — see docs.streamer.bot/api/websocket/events/command/triggered. Only the fields the Queue integration actually reads. */
export interface StreamerBotCommandTriggeredData {
  command: string | null;
  message: string | null;
  user: {
    display: string | null;
    name: string | null;
  } | null;
}

/** Custom.Event's own event.data shape — see docs.streamer.bot/api/websocket/events/custom/event. Raised by a Streamer.bot Action's "Raise Event" sub-action. */
export interface StreamerBotCustomEventData {
  eventName: string | null;
  useArgs: boolean;
  args: Record<string, unknown> | null;
}

/** GetGlobals' own response shape (see the official @streamerbot/client types: `variables` is a name-keyed record, not an array). */
export interface StreamerBotGetGlobalsResponse extends StreamerBotResponseEnvelope {
  variables: Record<string, { name: string; value: unknown; lastWrite: string }>;
  count: number;
}

export function toGlobalVariables(
  response: StreamerBotGetGlobalsResponse,
): StreamerBotGlobalVariable[] {
  return Object.values(response.variables ?? {}).map((entry) => ({
    name: entry.name,
    value: isVariableValue(entry.value) ? entry.value : String(entry.value ?? ""),
    lastWrite: entry.lastWrite,
  }));
}

function isVariableValue(
  value: unknown,
): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
