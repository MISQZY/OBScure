import type { EventBus } from '../eventBus'
import type { ConfigStore } from '../configStore'
import type { IntegrationKey } from '../../shared/types'

export type IntegrationStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface Integration {
  start(): Promise<void> | void
  stop(): void
  getStatus(): IntegrationStatus
}

export abstract class BaseIntegration implements Integration {
  protected status: IntegrationStatus = 'disconnected'

  constructor(
    public readonly key: IntegrationKey,
    protected readonly eventBus: EventBus,
    protected readonly config: ConfigStore
  ) {}

  protected setStatus(newStatus: IntegrationStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus
      this.eventBus.emit('integration-status', { key: this.key, status: newStatus })
    }
  }

  abstract start(): Promise<void> | void
  abstract stop(): void

  getStatus(): IntegrationStatus {
    return this.status
  }

  /** Overridden by integrations that support OAuth linking. */
  connect(): Promise<void> {
    return Promise.reject(new Error('Эта интеграция не поддерживает OAuth-подключение'))
  }

  /** Overridden by integrations that support OAuth linking. */
  disconnect(): Promise<void> | void {}
}
