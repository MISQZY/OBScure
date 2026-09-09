import { randomUUID } from "node:crypto";
import type { EventBus } from "./eventBus";
import type { ActionConfig, ActionQueueConfig } from "../shared/eventsConfig";
import type { ActionQueueRuntimeState } from "../shared/types";
import type { OverlayServer } from "./overlayServer";

interface RunEntry {
  id: string;
  sceneUrlKey: string;
  durationSeconds: number;
  startedAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

interface QueueRuntime {
  pending: RunEntry[];
  completed: number;
}

/**
 * Runs Actions through named Queues the way Streamer.bot's own Actions &
 * Queues does: a Blocking queue plays one run at a time, each occupying the
 * queue for its own Action's durationSeconds before the next starts; a
 * non-blocking queue fires every run the instant it's enqueued (and the
 * queue isn't paused), all running in parallel. Queue *definitions* (name/
 * paused/blocking) are supplied by the caller (see setQueues) and persisted
 * outside this class — it only owns the in-memory pending/completed
 * counters and dispatch timers, reset on every launch/profile switch, same
 * as RouletteEngine's own runtime state.
 */
export class ActionQueueEngine {
  private readonly eventBus: EventBus;
  private readonly overlayServer: OverlayServer;
  private queues: ActionQueueConfig[] = [];
  private runtime = new Map<string, QueueRuntime>();

  constructor(eventBus: EventBus, overlayServer: OverlayServer) {
    this.eventBus = eventBus;
    this.overlayServer = overlayServer;
  }

  /**
   * (Re)applies persisted queue definitions — called on load and after
   * every create/rename/delete. A queue that still exists keeps whatever
   * runtime state it already had; a removed queue's own pending runs are
   * dropped (their timers cleared) since there's nowhere left to complete
   * them into. Also re-kicks processing for every queue, since an unpause
   * or a newly-added queue can leave work ready to start.
   */
  setQueues(queues: ActionQueueConfig[]): void {
    this.queues = queues;
    for (const queue of queues) {
      if (!this.runtime.has(queue.id)) this.runtime.set(queue.id, { pending: [], completed: 0 });
    }
    for (const id of [...this.runtime.keys()]) {
      if (queues.some((queue) => queue.id === id)) continue;
      this.runtime.get(id)?.pending.forEach((run) => {
        if (run.timer) clearTimeout(run.timer);
      });
      this.runtime.delete(id);
    }
    this.emit();
    for (const queue of queues) this.pump(queue.id);
  }

  /** Drops every in-flight run (timers included) and zeroes every completed count without touching queue definitions — used on profile switch, where the previous profile's runs no longer mean anything. */
  reset(): void {
    for (const runtime of this.runtime.values()) {
      runtime.pending.forEach((run) => {
        if (run.timer) clearTimeout(run.timer);
      });
      runtime.pending = [];
      runtime.completed = 0;
    }
    this.emit();
  }

  getState(): ActionQueueRuntimeState[] {
    return this.queues.map((queue) => {
      const runtime = this.runtime.get(queue.id);
      return {
        id: queue.id,
        name: queue.name,
        paused: queue.paused,
        blocking: queue.blocking,
        pendingCount: runtime?.pending.length ?? 0,
        completedCount: runtime?.completed ?? 0,
      };
    });
  }

  /** Enqueues one run of `action` into its own queue (falls back to whichever queue is first if `action.queueId` no longer names a real queue) and immediately tries to start it. */
  enqueue(action: ActionConfig): void {
    const queueId = this.runtime.has(action.queueId) ? action.queueId : this.queues[0]?.id;
    if (!queueId) return;
    const runtime = this.runtime.get(queueId);
    if (!runtime) return;
    runtime.pending.push({
      id: randomUUID(),
      sceneUrlKey: action.sceneUrlKey,
      durationSeconds: action.durationSeconds,
      startedAt: null,
      timer: null,
    });
    this.emit();
    this.pump(queueId);
  }

  /** Zeroes one queue's own completed counter — the "Reset Counts" action Streamer.bot's own Queues page offers per queue. Pending runs are untouched. */
  resetCompleted(queueId: string): void {
    const runtime = this.runtime.get(queueId);
    if (!runtime) return;
    runtime.completed = 0;
    this.emit();
  }

  /** Starts whatever this queue is now allowed to start: the head of the line if Blocking and nothing is currently running, or every not-yet-started run at once otherwise. No-ops while paused. */
  private pump(queueId: string): void {
    const queue = this.queues.find((q) => q.id === queueId);
    const runtime = this.runtime.get(queueId);
    if (!queue || !runtime || queue.paused) return;
    if (queue.blocking) {
      if (runtime.pending.some((run) => run.startedAt !== null)) return;
      const next = runtime.pending.find((run) => run.startedAt === null);
      if (next) this.start(queueId, next);
      return;
    }
    for (const run of runtime.pending) {
      if (run.startedAt === null) this.start(queueId, run);
    }
  }

  private start(queueId: string, run: RunEntry): void {
    run.startedAt = Date.now();
    this.overlayServer.triggerCustomOverlay(run.sceneUrlKey);
    run.timer = setTimeout(() => this.complete(queueId, run.id), run.durationSeconds * 1000);
    this.emit();
  }

  private complete(queueId: string, runId: string): void {
    const runtime = this.runtime.get(queueId);
    if (!runtime) return;
    runtime.pending = runtime.pending.filter((run) => run.id !== runId);
    runtime.completed += 1;
    this.emit();
    this.pump(queueId);
  }

  private emit(): void {
    this.eventBus.emit("action-queues-state", this.getState());
  }
}
