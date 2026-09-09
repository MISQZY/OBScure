import { randomUUID } from "node:crypto";
import type { EventBus } from "./eventBus";
import type { AppEvents, EventLogEntry } from "../shared/types";

const MAX_ENTRIES = 300;

/**
 * Which AppEvents keys are worth showing in the live Event Log — discrete
 * occurrences only (a chat message arrived, a round started, Streamer.bot
 * pushed a command trigger, ...), same spirit as Streamer.bot's own Events
 * panel. Deliberately excludes the periodic state-SNAPSHOT broadcasts
 * ('now-playing', 'twitch-stats', 'streamerbot-globals') — those fire on a
 * fixed poll interval regardless of whether anything actually changed, so
 * logging them would just flood the log with noise instead of "events" in
 * the meaningful sense (Streamer.bot itself has no equivalent of "current
 * follower count, unchanged, again" as a loggable event either).
 */
const LOGGED_EVENTS: (keyof AppEvents)[] = [
  "alert",
  "chat-message",
  "points-redemption",
  "random-state",
  "roulette-state",
  "action-queues-state",
  "custom-overlay-trigger",
  "integration-status",
  "streamerbot-trigger",
];

/**
 * Taps a curated set of the internal EventBus's traffic (see LOGGED_EVENTS)
 * into a capped ring buffer, so the renderer's Event Log page (Данные →
 * Журнал событий) can show a live "what's happening" feed — the same role
 * Streamer.bot's own Events panel plays for ITS event sources, just for
 * OBScure's.
 */
export class EventLog {
  private entries: EventLogEntry[] = [];

  constructor(
    private readonly eventBus: EventBus,
    private readonly onEntry: (entry: EventLogEntry) => void,
  ) {
    for (const event of LOGGED_EVENTS) {
      this.eventBus.on(event, (payload) => this.record(event, payload));
    }
  }

  private record(event: keyof AppEvents, payload: unknown): void {
    const entry: EventLogEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      event,
      payload,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    this.onEntry(entry);
  }

  getEntries(): EventLogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }
}
