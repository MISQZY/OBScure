import { createHash } from "node:crypto";

/**
 * obs-websocket v5's own auth handshake (see github.com/obsproject/obs-websocket
 * "Authentication" spec): on connect the server immediately sends a Hello
 * (op 0); if its own `authentication` field is present, the client's
 * Identify (op 1) must carry this string, computed as:
 *   1. secret = base64(sha256(password + salt))
 *   2. authentication = base64(sha256(secret + challenge))
 * Byte-for-byte the same formula Streamer.bot's own protocol uses (see
 * integrations/streamerbot/protocol.ts's own copy) — kept as its own copy
 * here rather than a shared import, same "each integration owns its own
 * protocol module" convention that file already follows.
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

/** obs-websocket v5 opcodes (the `op` field of every message) — see the protocol's own "Base Message" spec. Only the ones this client actually sends/receives. */
export const OpCode = {
  Hello: 0,
  Identify: 1,
  Identified: 2,
  Event: 5,
  Request: 6,
  RequestResponse: 7,
} as const;

/**
 * Event subscription bit flags (see obs-websocket's own EventSubscription
 * enum). `InputVolumeMeters` is deliberately NOT part of "All" upstream —
 * OBS only starts pushing it once a client explicitly asks, since it's a
 * high-frequency "high-volume" event distinct from the general ones.
 */
export const EventSubscription = {
  General: 1 << 0,
  InputVolumeMeters: 1 << 16,
} as const;

const RPC_VERSION = 1;

export interface ObsHelloMessage {
  op: 0
  d: {
    obsWebSocketVersion: string
    rpcVersion: number
    authentication?: { challenge: string; salt: string }
  }
}

export function isHelloMessage(message: unknown): message is ObsHelloMessage {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { op?: unknown }).op === OpCode.Hello
  );
}

export function isIdentifiedMessage(message: unknown): boolean {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { op?: unknown }).op === OpCode.Identified
  );
}

/** Builds the Identify (op 1) payload — `authentication` omitted entirely when Hello carried none (an unauthenticated obs-websocket server). */
export function buildIdentifyMessage(
  password: string | null,
  challenge: { challenge: string; salt: string } | undefined,
): { op: 1; d: Record<string, unknown> } {
  const d: Record<string, unknown> = {
    rpcVersion: RPC_VERSION,
    eventSubscriptions: EventSubscription.General | EventSubscription.InputVolumeMeters,
  };
  if (challenge) {
    d.authentication = computeAuthString(password ?? "", challenge.salt, challenge.challenge);
  }
  return { op: OpCode.Identify, d };
}

export function buildRequestMessage(
  requestType: string,
  requestId: string,
  requestData?: Record<string, unknown>,
): { op: 6; d: Record<string, unknown> } {
  return {
    op: OpCode.Request,
    d: { requestType, requestId, ...(requestData ? { requestData } : {}) },
  };
}

export interface ObsRequestResponseMessage {
  op: 7
  d: {
    requestType: string
    requestId: string
    requestStatus: { result: boolean; code: number; comment?: string }
    responseData?: Record<string, unknown>
  }
}

export function isRequestResponseMessage(
  message: unknown,
): message is ObsRequestResponseMessage {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { op?: unknown }).op === OpCode.RequestResponse
  );
}

export interface ObsEventMessage {
  op: 5
  d: { eventType: string; eventData: Record<string, unknown> }
}

export function isEventMessage(message: unknown): message is ObsEventMessage {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { op?: unknown }).op === OpCode.Event
  );
}

/** `InputVolumeMeters`' own eventData shape — one entry per currently audio-active input, `inputLevelsMul` one triplet per channel (mono = 1, stereo = 2), each `[number, number, number]` a linear 0-1-ish multiplier (not dB) — see inputLevel below for how this collapses to one 0-1 loudness value. */
export interface ObsInputVolumeMetersEventData {
  inputs: { inputName: string; inputLevelsMul: number[][] }[]
}

/** The loudest of every channel/triplet value for one input's own `inputLevelsMul` — a single 0-1-ish loudness scalar (clamped to 1) standing in for "how loud is this input right now." obs-websocket exposes no per-frequency breakdown at all (see synthesizeBands' own doc comment for why this is the ceiling of what's possible from OBS). */
export function inputLevel(inputLevelsMul: number[][]): number {
  let max = 0;
  for (const channel of inputLevelsMul) {
    for (const value of channel) {
      if (Number.isFinite(value) && value > max) max = value;
    }
  }
  return Math.max(0, Math.min(1, max));
}

/**
 * Turns one real loudness scalar (from inputLevel above) into a
 * `bandCount`-length pseudo-spectrum, 0-255 per band — the closest an
 * OBS-sourced Equalizer can get to a real per-frequency-band signal, since
 * obs-websocket only ever exposes a single peak/magnitude per input, never
 * an FFT. Each band's own weight is a FIXED function of its index (a
 * stable sine-based hash, no per-tick randomness), so at a constant volume
 * the bars sit still rather than shimmering independently of the actual
 * audio — only genuine loudness changes move them, even though the SHAPE
 * across bars is synthesized rather than measured. Mirrors the same
 * mapping applyEqualizerLevels (overlays/custom-render.js) already expects
 * for a real capture-device feed, so buildEqualizer/EqualizerView need no
 * changes at all to render this.
 */
export function synthesizeBands(level: number, bandCount: number): number[] {
  const bands: number[] = [];
  for (let i = 0; i < bandCount; i++) {
    const weight = 0.55 + 0.45 * Math.abs(Math.sin(i * 12.9898));
    bands.push(Math.round(Math.max(0, Math.min(1, level * weight)) * 255));
  }
  return bands;
}

export interface ObsInput {
  inputName: string
  inputKind: string
}

export interface ObsGetInputListResponse {
  inputs: ObsInput[]
}
