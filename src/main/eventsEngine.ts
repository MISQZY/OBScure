import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { EventBus } from "./eventBus";
import type {
  QueueEntry,
  QueueEntrySource,
  QueueStatePayload,
  RandomStatePayload,
  RouletteEntrant,
  RouletteEntrantSource,
  RouletteStatePayload,
} from "../shared/types";

export class RandomEngine {
  private readonly eventBus: EventBus;
  private pendingSeed: string | null = null;
  private pendingMin = 0;
  private pendingMax = 0;
  private pendingCount = 1;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  commit(min: number, max: number, count: number): RandomStatePayload {
    const seed = randomBytes(16).toString("hex");
    this.pendingSeed = seed;
    this.pendingMin = min;
    this.pendingMax = max;
    this.pendingCount = count;
    const hash = hashSeed(seed);
    return this.emit({
      phase: "committed",
      hash,
      numbers: null,
      seed: null,
      min,
      max,
      count,
    });
  }

  reveal(): RandomStatePayload {
    if (!this.pendingSeed) {
      throw new Error("No active round — generate a hash first");
    }
    const seed = this.pendingSeed;
    const { pendingMin: min, pendingMax: max, pendingCount: count } = this;
    const hash = hashSeed(seed);

    const numbers: number[] = [];
    for (let i = 0; i < count; i++) {
      const h = hashSeed(`${seed}:${i}`);
      const n = min + (parseInt(h.slice(0, 8), 16) % (max - min + 1));
      numbers.push(n);
    }

    this.pendingSeed = null;

    // Stays 'revealed' indefinitely — no auto-clear timer. See
    // docs/main-process.md ("Events Engine") for why.
    return this.emit({
      phase: "revealed",
      hash,
      numbers,
      seed,
      min,
      max,
      count,
    });
  }

  private emit(state: RandomStatePayload): RandomStatePayload {
    this.eventBus.emit("random-state", state);
    return state;
  }
}

function hashSeed(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

const SPIN_DURATION_MS = 5_000;

export class RouletteEngine {
  private readonly eventBus: EventBus;
  private phase: RouletteStatePayload["phase"] = "idle";
  private entrants: RouletteEntrant[] = [];
  private endsAt: number | null = null;
  private winner: RouletteEntrant | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingSeed: string | null = null;
  private hash: string | null = null;
  private seed: string | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  getState(): RouletteStatePayload {
    return {
      phase: this.phase,
      entrants: this.entrants,
      endsAt: this.endsAt,
      winner: this.winner,
      hash: this.hash,
      seed: this.seed,
    };
  }

  start(durationSeconds: number): RouletteStatePayload {
    this.clearTimer();
    this.phase = "collecting";
    this.entrants = [];
    this.winner = null;
    this.pendingSeed = randomBytes(16).toString("hex");
    this.hash = hashSeed(this.pendingSeed);
    this.seed = null;
    this.endsAt = Date.now() + durationSeconds * 1000;
    this.timer = setTimeout(
      () => this.finishCollecting(),
      durationSeconds * 1000,
    );
    return this.emit();
  }

  addEntrant(
    name: string,
    source: RouletteEntrantSource,
  ): RouletteStatePayload {
    const trimmed = name.trim();
    if (this.phase !== "collecting" || !trimmed) return this.getState();
    const key = trimmed.toLowerCase();
    const existing = this.entrants.find(
      (entrant) => entrant.name.toLowerCase() === key,
    );
    if (existing) {
      if (source !== "points") return this.getState();
      existing.weight += 1;
      return this.emit();
    }
    this.entrants.push({ id: randomUUID(), name: trimmed, source, weight: 1 });
    return this.emit();
  }

  removeEntrant(id: string): RouletteStatePayload {
    if (this.phase !== "collecting") return this.getState();
    this.entrants = this.entrants.filter((entrant) => entrant.id !== id);
    return this.emit();
  }

  finishEarly(): RouletteStatePayload {
    if (this.phase !== "collecting") return this.getState();
    this.clearTimer();
    this.finishCollecting();
    return this.getState();
  }

  cancel(): RouletteStatePayload {
    this.clearTimer();
    this.phase = "idle";
    this.entrants = [];
    this.winner = null;
    this.endsAt = null;
    this.pendingSeed = null;
    this.hash = null;
    this.seed = null;
    return this.emit();
  }

  private finishCollecting(): void {
    this.timer = null;
    this.endsAt = null;

    if (this.entrants.length === 0) {
      this.phase = "idle";
      this.pendingSeed = null;
      this.hash = null;
      this.seed = null;
      this.emit();
      return;
    }

    this.phase = "spinning";
    this.seed = this.pendingSeed;
    this.winner = this.pickWeightedWinner();
    this.emit();

    this.timer = setTimeout(() => {
      this.timer = null;
      this.phase = "result";
      this.emit();
    }, SPIN_DURATION_MS);
  }

  private pickWeightedWinner(): RouletteEntrant {
    const totalWeight = this.entrants.reduce(
      (sum, entrant) => sum + entrant.weight,
      0,
    );
    const hash = this.hash ?? hashSeed(this.seed ?? "");
    let roll = parseInt(hash.slice(0, 8), 16) % totalWeight;
    for (const entrant of this.entrants) {
      roll -= entrant.weight;
      if (roll < 0) return entrant;
    }
    return this.entrants[this.entrants.length - 1];
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(): RouletteStatePayload {
    const state = this.getState();
    this.eventBus.emit("roulette-state", state);
    return state;
  }
}

/**
 * A simple ordered viewer queue (sign-up line) — no timer/phase, unlike
 * RouletteEngine above: entries just sit in join order until popped or
 * removed. Open/closed gates whether addEntry does anything, same role
 * RouletteEngine's 'collecting' phase plays for its own addEntrant.
 */
export class QueueEngine {
  private readonly eventBus: EventBus;
  private isOpen = false;
  private entries: QueueEntry[] = [];

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  getState(): QueueStatePayload {
    return { isOpen: this.isOpen, entries: this.entries };
  }

  open(): QueueStatePayload {
    this.isOpen = true;
    return this.emit();
  }

  close(): QueueStatePayload {
    this.isOpen = false;
    return this.emit();
  }

  addEntry(name: string, source: QueueEntrySource): QueueStatePayload {
    const trimmed = name.trim();
    if (!this.isOpen || !trimmed) return this.getState();
    const key = trimmed.toLowerCase();
    if (this.entries.some((entry) => entry.name.toLowerCase() === key)) {
      return this.getState();
    }
    this.entries.push({
      id: randomUUID(),
      name: trimmed,
      source,
      addedAt: Date.now(),
    });
    return this.emit();
  }

  removeEntry(id: string): QueueStatePayload {
    this.entries = this.entries.filter((entry) => entry.id !== id);
    return this.emit();
  }

  /** Removes and returns the first entry ("call next"), or null if the queue is empty. */
  popNext(): QueueEntry | null {
    const popped = this.entries.shift() ?? null;
    this.emit();
    return popped;
  }

  clear(): QueueStatePayload {
    this.entries = [];
    return this.emit();
  }

  /** Reorders to match `ids`; any existing entry not named in `ids` is kept, appended after — a stale/partial reorder request never silently drops entries. */
  reorder(ids: string[]): QueueStatePayload {
    const byId = new Map(this.entries.map((entry) => [entry.id, entry]));
    const reordered = ids
      .map((id) => byId.get(id))
      .filter((entry): entry is QueueEntry => !!entry);
    const reorderedIds = new Set(reordered.map((entry) => entry.id));
    const remaining = this.entries.filter((entry) => !reorderedIds.has(entry.id));
    this.entries = [...reordered, ...remaining];
    return this.emit();
  }

  private emit(): QueueStatePayload {
    const state = this.getState();
    this.eventBus.emit("queue-state", state);
    return state;
  }
}
