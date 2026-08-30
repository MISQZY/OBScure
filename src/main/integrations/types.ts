import type { EventBus } from "../eventBus";
import type { ConfigStore } from "../configStore";
import type { IntegrationKey } from "../../shared/types";

export type IntegrationStatus =
  "disconnected" | "connecting" | "connected" | "error";

export interface Integration {
  start(): Promise<void> | void;
  stop(): void;
  getStatus(): IntegrationStatus;
}

export abstract class BaseIntegration implements Integration {
  protected status: IntegrationStatus = "disconnected";
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public readonly key: IntegrationKey,
    protected readonly eventBus: EventBus,
    protected readonly config: ConfigStore,
  ) {}

  /**
   * Clears any existing poll timer, invokes `fn` immediately, then invokes it
   * again every `intervalMs`.
   */
  protected startPolling(
    fn: () => void | Promise<void>,
    intervalMs: number,
  ): void {
    this.stopPolling();
    void fn();
    this.pollTimer = setInterval(() => void fn(), intervalMs);
  }

  protected stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  protected setStatus(newStatus: IntegrationStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.eventBus.emit("integration-status", {
        key: this.key,
        status: newStatus,
      });
    }
  }

  abstract start(): Promise<void> | void;
  abstract stop(): void;

  getStatus(): IntegrationStatus {
    return this.status;
  }

  connect(): Promise<void> {
    return Promise.reject(
      new Error("Эта интеграция не поддерживает OAuth-подключение"),
    );
  }

  disconnect(): Promise<void> | void {}
}
