import { randomUUID } from "node:crypto";
import { ipcMain } from "electron";
import type { ConfigStore } from "../configStore";
import type { ActionQueueEngine } from "../actionQueueEngine";
import type { ActionConfig, ActionQueueConfig } from "../../shared/eventsConfig";
import { DEFAULT_ACTION_QUEUE_ID, normalizeActionConfig } from "../../shared/eventsConfig";
import type { ActionQueueRuntimeState } from "../../shared/types";

interface ActionsHandlersDeps {
  config: () => ConfigStore;
  actionQueueEngine: ActionQueueEngine;
  actionsSettingKey: string;
  actionQueuesSettingKey: string;
  getStoredActions: () => ActionConfig[];
  getStoredActionQueues: () => ActionQueueConfig[];
}

/**
 * IPC for the "Действия" (Actions) and "Очереди" (Queues) pages — the
 * Streamer.bot-shaped replacement for the old single viewer Queue tool. Actions
 * are a plain CRUD list (same `getAll`/`save`/`delete` shape
 * registerCustomPackHandlers gives Locales/Global Variables in
 * overlayHandlers.ts); Queues additionally drive ActionQueueEngine, since
 * pause/blocking/create/rename/remove all need to update its live runtime
 * state, not just config.json.
 */
export function registerActionsHandlers(deps: ActionsHandlersDeps): void {
  const {
    config,
    actionQueueEngine,
    actionsSettingKey,
    actionQueuesSettingKey,
    getStoredActions,
    getStoredActionQueues,
  } = deps;

  function saveQueues(next: ActionQueueConfig[]): ActionQueueRuntimeState[] {
    config().setSetting(actionQueuesSettingKey, next);
    actionQueueEngine.setQueues(next);
    return actionQueueEngine.getState();
  }

  ipcMain.handle("actions:getAll", (): ActionConfig[] => getStoredActions());

  ipcMain.handle(
    "actions:save",
    (_event, action: ActionConfig): ActionConfig[] => {
      const normalized = normalizeActionConfig(action);
      const current = getStoredActions();
      const exists = current.some((a) => a.id === normalized.id);
      const next = exists
        ? current.map((a) => (a.id === normalized.id ? normalized : a))
        : [...current, normalized];
      config().setSetting(actionsSettingKey, next);
      return next;
    },
  );

  ipcMain.handle(
    "actions:delete",
    (_event, id: string): ActionConfig[] => {
      const next = getStoredActions().filter((a) => a.id !== id);
      config().setSetting(actionsSettingKey, next);
      return next;
    },
  );

  // Manual "run now" from ActionsPage — same enqueue path a matched chat
  // command/Streamer.bot trigger goes through, just skipping the trigger
  // match itself.
  ipcMain.handle("actions:run", (_event, id: string): void => {
    const action = getStoredActions().find((a) => a.id === id);
    if (action) actionQueueEngine.enqueue(action);
  });

  ipcMain.handle("actionQueues:getState", (): ActionQueueRuntimeState[] =>
    actionQueueEngine.getState(),
  );

  ipcMain.handle(
    "actionQueues:create",
    (_event, name: string): ActionQueueRuntimeState[] => {
      const trimmed = name.trim();
      if (!trimmed) return actionQueueEngine.getState();
      const next: ActionQueueConfig[] = [
        ...getStoredActionQueues(),
        { id: randomUUID(), name: trimmed, paused: false, blocking: false },
      ];
      return saveQueues(next);
    },
  );

  ipcMain.handle(
    "actionQueues:rename",
    (_event, id: string, name: string): ActionQueueRuntimeState[] => {
      const trimmed = name.trim();
      if (!trimmed) return actionQueueEngine.getState();
      const next = getStoredActionQueues().map((q) => (q.id === id ? { ...q, name: trimmed } : q));
      return saveQueues(next);
    },
  );

  // A queue with Actions still pointed at it, or the undeletable Default
  // queue, is refused — a silent no-op rather than an error, since
  // QueuesPage already disables the delete control in both cases and only
  // ever calls this from that same guarded control.
  ipcMain.handle(
    "actionQueues:remove",
    (_event, id: string): ActionQueueRuntimeState[] => {
      const current = getStoredActionQueues();
      const inUse = getStoredActions().some((a) => a.queueId === id);
      if (id === DEFAULT_ACTION_QUEUE_ID || inUse || current.length <= 1) {
        return actionQueueEngine.getState();
      }
      return saveQueues(current.filter((q) => q.id !== id));
    },
  );

  ipcMain.handle(
    "actionQueues:setPaused",
    (_event, id: string, paused: boolean): ActionQueueRuntimeState[] => {
      const next = getStoredActionQueues().map((q) => (q.id === id ? { ...q, paused } : q));
      return saveQueues(next);
    },
  );

  ipcMain.handle(
    "actionQueues:setBlocking",
    (_event, id: string, blocking: boolean): ActionQueueRuntimeState[] => {
      const next = getStoredActionQueues().map((q) => (q.id === id ? { ...q, blocking } : q));
      return saveQueues(next);
    },
  );

  ipcMain.handle(
    "actionQueues:resetCompleted",
    (_event, id: string): ActionQueueRuntimeState[] => {
      actionQueueEngine.resetCompleted(id);
      return actionQueueEngine.getState();
    },
  );
}
