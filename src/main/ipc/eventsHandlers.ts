import { ipcMain } from "electron";
import type { ConfigStore } from "../configStore";
import type { QueueEngine, RandomEngine, RouletteEngine } from "../eventsEngine";
import type {
  QueueStatePayload,
  RandomStatePayload,
  RouletteStatePayload,
} from "../../shared/types";
import {
  DEFAULT_EVENTS_CONFIGS,
  MAX_ROULETTE_DURATION_SECONDS,
  MIN_ROULETTE_DURATION_SECONDS,
  normalizeQueueConfig,
  normalizeRandomConfig,
  normalizeRouletteConfig,
  type EventsConfigs,
  type EventTarget,
} from "../../shared/eventsConfig";

interface EventsHandlersDeps {
  config: () => ConfigStore;
  randomEngine: RandomEngine;
  rouletteEngine: RouletteEngine;
  queueEngine: QueueEngine;
  eventsConfigSettingKeys: Record<EventTarget, string>;
  getStoredRandomConfig: () => EventsConfigs["random"];
  getStoredRouletteConfig: () => EventsConfigs["roulette"];
  getStoredQueueConfig: () => EventsConfigs["queue"];
}

/** normalize/get fns per EventTarget — keeps events:getConfig/setConfig from growing an if/else per tool as new ones (Queue, ...) are added. */
function normalizeEventsConfig(
  target: EventTarget,
  value: unknown,
): EventsConfigs[EventTarget] {
  if (target === "roulette") return normalizeRouletteConfig(value);
  if (target === "queue") return normalizeQueueConfig(value);
  return normalizeRandomConfig(value);
}

export function registerEventsHandlers(deps: EventsHandlersDeps): void {
  const {
    config,
    randomEngine,
    rouletteEngine,
    queueEngine,
    eventsConfigSettingKeys,
    getStoredRandomConfig,
    getStoredRouletteConfig,
    getStoredQueueConfig,
  } = deps;

  ipcMain.handle(
    "events:getConfig",
    (_event, target: EventTarget): EventsConfigs[EventTarget] => {
      if (target === "roulette") return getStoredRouletteConfig();
      if (target === "queue") return getStoredQueueConfig();
      return getStoredRandomConfig();
    },
  );

  ipcMain.handle(
    "events:setConfig",
    (_event, target: EventTarget, value: EventsConfigs[EventTarget]) => {
      const normalized = normalizeEventsConfig(target, value);
      config().setSetting(eventsConfigSettingKeys[target], normalized);
      return normalized;
    },
  );

  ipcMain.handle(
    "events:random:commit",
    (_event, min: number, max: number, count: number): RandomStatePayload => {
      const lo = Math.trunc(Math.min(min, max));
      const hi = Math.trunc(Math.max(min, max));
      const maxCount = Math.min(10, Math.max(1, count));
      return randomEngine.commit(lo, hi > lo ? hi : lo + 1, maxCount);
    },
  );

  ipcMain.handle("events:random:reveal", (): RandomStatePayload =>
    randomEngine.reveal(),
  );

  ipcMain.handle(
    "events:roulette:start",
    (_event, durationSeconds: number): RouletteStatePayload => {
      const seconds = Math.trunc(durationSeconds);
      const clamped = Math.min(
        MAX_ROULETTE_DURATION_SECONDS,
        Math.max(MIN_ROULETTE_DURATION_SECONDS, seconds),
      );
      return rouletteEngine.start(
        seconds > 0 ? clamped : DEFAULT_EVENTS_CONFIGS.roulette.durationSeconds,
      );
    },
  );

  ipcMain.handle(
    "events:roulette:addEntrant",
    (_event, name: string): RouletteStatePayload =>
      rouletteEngine.addEntrant(name, "manual"),
  );

  ipcMain.handle(
    "events:roulette:removeEntrant",
    (_event, id: string): RouletteStatePayload =>
      rouletteEngine.removeEntrant(id),
  );

  ipcMain.handle("events:roulette:cancel", (): RouletteStatePayload =>
    rouletteEngine.cancel(),
  );

  ipcMain.handle("events:roulette:finishEarly", (): RouletteStatePayload =>
    rouletteEngine.finishEarly(),
  );

  ipcMain.handle("events:roulette:getState", (): RouletteStatePayload =>
    rouletteEngine.getState(),
  );

  ipcMain.handle("events:queue:open", (): QueueStatePayload =>
    queueEngine.open(),
  );

  ipcMain.handle("events:queue:close", (): QueueStatePayload =>
    queueEngine.close(),
  );

  ipcMain.handle(
    "events:queue:addEntry",
    (_event, name: string): QueueStatePayload =>
      queueEngine.addEntry(name, "manual"),
  );

  ipcMain.handle(
    "events:queue:removeEntry",
    (_event, id: string): QueueStatePayload => queueEngine.removeEntry(id),
  );

  ipcMain.handle(
    "events:queue:popNext",
    (): { state: QueueStatePayload; popped: ReturnType<QueueEngine["popNext"]> } => {
      const popped = queueEngine.popNext();
      return { state: queueEngine.getState(), popped };
    },
  );

  ipcMain.handle("events:queue:clear", (): QueueStatePayload =>
    queueEngine.clear(),
  );

  ipcMain.handle(
    "events:queue:reorder",
    (_event, ids: string[]): QueueStatePayload => queueEngine.reorder(ids),
  );

  ipcMain.handle("events:queue:getState", (): QueueStatePayload =>
    queueEngine.getState(),
  );
}
