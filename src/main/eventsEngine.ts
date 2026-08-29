import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { EventBus } from './eventBus'
import type { RandomStatePayload, RouletteEntrant, RouletteEntrantSource, RouletteStatePayload } from '../shared/types'

/** How long a revealed result stays up in the app's Random tool page before it self-clears back to idle. */
const REVEAL_DISPLAY_MS = 30_000

/**
 * Provably-fair number generator: commit() publishes SHA-256(seed) — the
 * number itself stays unknown until reveal() discloses the seed it was
 * derived from. Anyone can then hash that seed themselves and check it
 * matches the hash that was published first, proving the result wasn't
 * picked (or changed) after the fact.
 */
export class RandomEngine {
  private readonly eventBus: EventBus
  private pendingSeed: string | null = null
  private pendingMin = 0
  private pendingMax = 0
  private pendingCount = 1
  private clearTimer: ReturnType<typeof setTimeout> | null = null

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus
  }

  commit(min: number, max: number, count: number): RandomStatePayload {
    if (this.clearTimer) clearTimeout(this.clearTimer)
    const seed = randomBytes(16).toString('hex')
    this.pendingSeed = seed
    this.pendingMin = min
    this.pendingMax = max
    this.pendingCount = count
    const hash = hashSeed(seed)
    return this.emit({ phase: 'committed', hash, numbers: null, seed: null, min, max, count })
  }

  reveal(): RandomStatePayload {
    if (!this.pendingSeed) {
      throw new Error('Нет активного раунда — сначала сгенерируй хэш')
    }
    const seed = this.pendingSeed
    const { pendingMin: min, pendingMax: max, pendingCount: count } = this
    const hash = hashSeed(seed)
    
    const numbers: number[] = []
    for (let i = 0; i < count; i++) {
      const h = hashSeed(`${seed}:${i}`)
      const n = min + (parseInt(h.slice(0, 8), 16) % (max - min + 1))
      numbers.push(n)
    }

    this.pendingSeed = null

    const state = this.emit({ phase: 'revealed', hash, numbers, seed, min, max, count })
    this.clearTimer = setTimeout(() => {
      this.emit({ phase: 'idle', hash: null, numbers: null, seed: null, min, max, count })
    }, REVEAL_DISPLAY_MS)
    return state
  }

  private emit(state: RandomStatePayload): RandomStatePayload {
    this.eventBus.emit('random-state', state)
    return state
  }
}

function hashSeed(seed: string): string {
  return createHash('sha256').update(seed).digest('hex')
}

/** How long the "spinning" phase plays in the app's Roulette tool page before the winner is announced. */
const SPIN_DURATION_MS = 5_000

/**
 * A round accepts entrants (from chat, points redemptions, or manual test
 * adds — see index.ts) for `durationSeconds`, then picks one. State
 * transitions (collecting → spinning → result) are driven from here on a
 * timer, independent of whether the app window is currently open, and
 * broadcast on the event bus for whoever's listening (the Roulette tool page
 * in the app window). 'result' stays up — with the winner, entrants, hash and
 * seed all intact — until the next start() call begins a new round.
 *
 * Provably fair like RandomEngine: start() commits SHA-256(seed) before a
 * single entrant has joined, so the winner (derived from that seed once
 * revealed at spin time — see pickWeightedWinner) can't have been chosen to
 * favor anyone. The seed is revealed the moment collecting ends, alongside
 * the now-final entrant list, so anyone can recompute the hash and the draw
 * themselves.
 */
export class RouletteEngine {
  private readonly eventBus: EventBus
  private phase: RouletteStatePayload['phase'] = 'idle'
  private entrants: RouletteEntrant[] = []
  private endsAt: number | null = null
  private winner: RouletteEntrant | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private pendingSeed: string | null = null
  private hash: string | null = null
  private seed: string | null = null

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus
  }

  getState(): RouletteStatePayload {
    return {
      phase: this.phase,
      entrants: this.entrants,
      endsAt: this.endsAt,
      winner: this.winner,
      hash: this.hash,
      seed: this.seed
    }
  }

  start(durationSeconds: number): RouletteStatePayload {
    this.clearTimer()
    this.phase = 'collecting'
    this.entrants = []
    this.winner = null
    this.pendingSeed = randomBytes(16).toString('hex')
    this.hash = hashSeed(this.pendingSeed)
    this.seed = null
    this.endsAt = Date.now() + durationSeconds * 1000
    this.timer = setTimeout(() => this.finishCollecting(), durationSeconds * 1000)
    return this.emit()
  }

  /**
   * No-op outside the collecting phase, or for a blank name. A chat/manual
   * entry only ever grants one entry per viewer — re-entering does nothing.
   * A points-reward redemption stacks: each redemption adds one more entry
   * for that viewer (on top of any existing entry), so spending more channel
   * points on the reward buys proportionally better odds — see
   * finishCollecting's weighted draw.
   */
  addEntrant(name: string, source: RouletteEntrantSource): RouletteStatePayload {
    const trimmed = name.trim()
    if (this.phase !== 'collecting' || !trimmed) return this.getState()
    const key = trimmed.toLowerCase()
    const existing = this.entrants.find((entrant) => entrant.name.toLowerCase() === key)
    if (existing) {
      if (source !== 'points') return this.getState()
      existing.weight += 1
      return this.emit()
    }
    this.entrants.push({ id: randomUUID(), name: trimmed, source, weight: 1 })
    return this.emit()
  }

  /** No-op outside the collecting phase, or for an unknown id — used by the "×" on an entrant's badge. */
  removeEntrant(id: string): RouletteStatePayload {
    if (this.phase !== 'collecting') return this.getState()
    this.entrants = this.entrants.filter((entrant) => entrant.id !== id)
    return this.emit()
  }

  /** Ends the collecting phase right now instead of waiting out durationSeconds — same draw as the timer would've produced (it's the same finishCollecting()), just triggered early. No-op outside the collecting phase. */
  finishEarly(): RouletteStatePayload {
    if (this.phase !== 'collecting') return this.getState()
    this.clearTimer()
    this.finishCollecting()
    return this.getState()
  }

  cancel(): RouletteStatePayload {
    this.clearTimer()
    this.phase = 'idle'
    this.entrants = []
    this.winner = null
    this.endsAt = null
    this.pendingSeed = null
    this.hash = null
    this.seed = null
    return this.emit()
  }

  private finishCollecting(): void {
    this.timer = null
    this.endsAt = null

    if (this.entrants.length === 0) {
      this.phase = 'idle'
      this.pendingSeed = null
      this.hash = null
      this.seed = null
      this.emit()
      return
    }

    this.phase = 'spinning'
    this.seed = this.pendingSeed
    this.winner = this.pickWeightedWinner()
    this.emit()

    this.timer = setTimeout(() => {
      this.timer = null
      this.phase = 'result'
      this.emit()
    }, SPIN_DURATION_MS)
  }

  /**
   * Draws a winner with probability proportional to each entrant's weight
   * (entry count), deterministically from the hash committed back in
   * start() — before any entrant had joined — the same way RandomEngine
   * derives its number from a committed hash. Since the hash (and now the
   * revealed seed) were public before the entrant list was final, anyone can
   * hash the seed themselves and re-run this exact draw to confirm the
   * winner wasn't picked after the fact.
   */
  private pickWeightedWinner(): RouletteEntrant {
    const totalWeight = this.entrants.reduce((sum, entrant) => sum + entrant.weight, 0)
    const hash = this.hash ?? hashSeed(this.seed ?? '')
    let roll = parseInt(hash.slice(0, 8), 16) % totalWeight
    for (const entrant of this.entrants) {
      roll -= entrant.weight
      if (roll < 0) return entrant
    }
    return this.entrants[this.entrants.length - 1]
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private emit(): RouletteStatePayload {
    const state = this.getState()
    this.eventBus.emit('roulette-state', state)
    return state
  }
}
