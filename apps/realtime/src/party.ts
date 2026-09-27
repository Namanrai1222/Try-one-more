/**
 * What every party game shares, with no networking in it: seats, the host, rounds, emotes,
 * and the strike count for clients that send garbage (SECURITY.md §5). The rules of each game
 * live in a subclass — `Match` (the platformer's Race and Sabotage) and `PushMatch`.
 */
import { STEP_MS } from '@jom/engine';

export type Mode = 'race' | 'sabotage' | 'push';
export type Phase = 'lobby' | 'playing' | 'results';
export type Result = { ok: true } | { ok: false; reason: string };

export interface Member {
  id: string;
  seat: number;
  connected: boolean;
  /** Left while playing: that counts as a loss (SECURITY.md §5). */
  left: boolean;
  strikes: number;
  nextEmoteAt: number;
}

/** Fixed emote set (SECURITY.md §5: no free text). The client draws them; ids travel. */
export const EMOTE_COUNT = 8;
const EMOTE_COOLDOWN_MS = 1_000;
const MAX_STRIKES = 20;

export abstract class Party<P extends Member> {
  abstract readonly mode: Mode;
  abstract readonly maxPlayers: number;
  phase: Phase = 'lobby';
  players = new Map<string, P>();
  host: string | null = null;
  round = 0;
  startedAt = 0;

  protected abstract blank(id: string, seat: number): P;
  /** Whether this player takes part in the current round. */
  abstract plays(p: P): boolean;
  abstract start(by: string, now: number): Result;
  abstract input(id: string, frame: unknown, mask: unknown, now: number): Result;
  /** Advance the round to `now`; moves to 'results' when it ends. */
  abstract tick(now: number): void;
  /** What everyone receives at 20Hz. */
  abstract snapshot(now: number): unknown;

  join(id: string): Result & { seat?: number } {
    const known = this.players.get(id);
    if (known) {
      known.connected = true;
      return { ok: true, seat: known.seat };
    }
    if (this.phase !== 'lobby') return { ok: false, reason: 'A round is already running.' };
    if (this.players.size >= this.maxPlayers) return { ok: false, reason: 'The room is full.' };
    const taken = new Set([...this.players.values()].map((p) => p.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    this.players.set(id, this.blank(id, seat));
    this.host ??= id;
    return { ok: true, seat };
  }

  /** A player is gone for good (reconnection window over, or left on purpose). */
  leave(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'playing') {
      p.left = true;
      p.connected = false;
    } else {
      this.players.delete(id);
    }
    if (this.host === id) {
      this.host = [...this.players.values()].find((q) => !q.left && q.connected)?.id ?? null;
    }
  }

  emote(id: string, emote: unknown, now: number): Result {
    const p = this.players.get(id);
    if (
      !p ||
      !Number.isInteger(emote) ||
      (emote as number) < 0 ||
      (emote as number) >= EMOTE_COUNT
    ) {
      return { ok: false, reason: 'No such emote.' };
    }
    if (now < p.nextEmoteAt) return { ok: false, reason: 'Too soon.' };
    p.nextEmoteAt = now + EMOTE_COOLDOWN_MS;
    return { ok: true };
  }

  /** Back to the lobby after results. */
  next(by: string): Result {
    if (by !== this.host || this.phase !== 'results') return { ok: false, reason: 'Not now.' };
    this.phase = 'lobby';
    for (const [id, p] of this.players) if (p.left) this.players.delete(id);
    return { ok: true };
  }

  elapsed(now: number): number {
    return Math.floor((now - this.startedAt) / STEP_MS);
  }

  /** The shared half of `start`: host only, from the lobby, two connected players. */
  protected begin(by: string, now: number): Result {
    if (by !== this.host) return { ok: false, reason: 'Only the host can start.' };
    if (this.phase !== 'lobby') return { ok: false, reason: 'Already started.' };
    const active = [...this.players.values()].filter((p) => p.connected);
    if (active.length < 2) return { ok: false, reason: 'Two players are needed.' };
    this.round++;
    this.phase = 'playing';
    this.startedAt = now;
    return { ok: true };
  }

  protected strike(p: P, reason: string): Result {
    p.strikes++;
    return { ok: false, reason: p.strikes >= MAX_STRIKES ? 'kick' : reason };
  }
}
