import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import type { IntegrationStatus } from "../types";
import {
  buildIdentifyMessage,
  buildRequestMessage,
  isEventMessage,
  isHelloMessage,
  isIdentifiedMessage,
  isRequestResponseMessage,
  type ObsEventMessage,
  type ObsRequestResponseMessage,
} from "./protocol";

const MIN_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface ObsSocketHandlers {
  isStopping(): boolean;
  setStatus(status: IntegrationStatus): void;
  /** Called once Hello -> Identify -> Identified all succeed — the socket is ready for requests. */
  onReady(): void;
  onEvent(message: ObsEventMessage): void;
  reconnect(): Promise<void>;
}

interface PendingRequest {
  resolve: (value: ObsRequestResponseMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function parseJson(raw: WebSocket.RawData): Record<string, unknown> | null {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

/**
 * Owns the obs-websocket connection lifecycle: connecting, the
 * Hello/Identify/Identified handshake (see protocol.ts's own doc comment),
 * request/response correlation by `requestId`, dispatching pushed events
 * (InputVolumeMeters in particular), and the reconnect-with-backoff loop —
 * same shape as StreamerBotSocket, adapted for obs-websocket's op-code
 * envelope instead of Streamer.bot's flat request/id one.
 */
export class ObsSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly handlers: ObsSocketHandlers) {}

  async connect(url: string, password: string | null): Promise<void> {
    const socket = await this.handshake(url, password);
    this.attachSocket(socket);
    this.reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
    this.handlers.setStatus("connected");
    this.handlers.onReady();
  }

  private handshake(url: string, password: string | null): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      let settled = false;

      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      const onClose = (): void =>
        finish(() => reject(new Error("OBS closed the connection before Hello")));
      const onError = (error: Error): void => finish(() => reject(error));

      const onHello = (raw: WebSocket.RawData): void => {
        const message = parseJson(raw);
        if (!isHelloMessage(message)) return;
        socket.off("message", onHello);
        socket.off("close", onClose);
        socket.off("error", onError);

        if (message.d.authentication && !password) {
          socket.terminate();
          finish(() => reject(new Error("OBS requires a password, but none is configured")));
          return;
        }
        const identify = buildIdentifyMessage(password, message.d.authentication);

        const onIdentifyClose = (): void =>
          finish(() => reject(new Error("OBS closed the connection during Identify")));
        const onIdentifyError = (error: Error): void => finish(() => reject(error));
        const onIdentified = (raw2: WebSocket.RawData): void => {
          const response = parseJson(raw2);
          if (!isIdentifiedMessage(response)) return;
          socket.off("message", onIdentified);
          socket.off("close", onIdentifyClose);
          socket.off("error", onIdentifyError);
          finish(() => resolve(socket));
        };

        socket.on("message", onIdentified);
        socket.once("close", onIdentifyClose);
        socket.once("error", onIdentifyError);
        socket.send(JSON.stringify(identify));
      };

      socket.on("message", onHello);
      socket.once("close", onClose);
      socket.once("error", onError);
    });
  }

  private attachSocket(socket: WebSocket): void {
    this.socket = socket;

    socket.on("message", (raw) => {
      if (this.socket !== socket) return;
      const message = parseJson(raw);
      if (!message) return;

      if (isRequestResponseMessage(message)) {
        const pendingRequest = this.pending.get(message.d.requestId);
        if (!pendingRequest) return;
        this.pending.delete(message.d.requestId);
        clearTimeout(pendingRequest.timer);
        if (!message.d.requestStatus.result) {
          pendingRequest.reject(new Error(message.d.requestStatus.comment ?? "OBS request failed"));
        } else {
          pendingRequest.resolve(message);
        }
        return;
      }

      if (isEventMessage(message)) this.handlers.onEvent(message);
    });

    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.rejectAllPending(new Error("OBS connection closed"));
      if (this.handlers.isStopping()) return;
      this.handlers.setStatus("error");
      this.scheduleReconnect();
    });

    socket.on("error", () => {
      // 'close' always follows an 'error' — all retry logic lives there.
    });
  }

  sendRequest(
    requestType: string,
    requestData?: Record<string, unknown>,
  ): Promise<ObsRequestResponseMessage> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Not connected to OBS"));
    }
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`OBS request "${requestType}" timed out`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify(buildRequestMessage(requestType, requestId, requestData)));
    });
  }

  private rejectAllPending(error: Error): void {
    for (const pendingRequest of this.pending.values()) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(error);
    }
    this.pending.clear();
  }

  cancelReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  scheduleReconnect(): void {
    if (this.handlers.isStopping()) return;
    this.cancelReconnect();
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      void this.handlers.reconnect();
    }, delay);
  }

  teardownAll(): void {
    this.cancelReconnect();
    this.rejectAllPending(new Error("OBS integration stopped"));
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.terminate();
    }
    this.socket = null;
  }
}
