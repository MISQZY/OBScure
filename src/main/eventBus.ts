import { EventEmitter } from "node:events";
import type { AppEvents } from "../shared/types";

export type {
  NowPlayingPayload,
  AlertPayload,
  AlertType,
  AppEvents,
} from "../shared/types";

export class EventBus extends EventEmitter {
  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof AppEvents>(
    event: K,
    listener: (payload: AppEvents[K]) => void,
  ): this {
    return super.on(event, listener);
  }

  off<K extends keyof AppEvents>(
    event: K,
    listener: (payload: AppEvents[K]) => void,
  ): this {
    return super.off(event, listener);
  }
}

export const eventBus = new EventBus();
