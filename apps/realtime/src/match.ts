/**
 * The rules of a platformer match — Race and Sabotage (PRD.md §4.8, SECURITY.md §5) — with no
 * networking in it. The server owns every outcome: clients send inputs (frame + mask) and
 * saboteur choices, never positions or results. Each player's run is simulated here with the
 * same deterministic engine the client predicts with, so a client can only ever be *behind*
 * the truth, never ahead of it. Time is passed in, which keeps this module testable.
 */
import { INPUT_MASK_ALL, LEADER_GATE, createSimState, hashState, step, toPx } from '@jom/engine';
import type { SimState } from '@jom/engine';
import { RACE_LEVELS, SABOTAGE_LEVELS } from '@jom/game-rage/levels';
import type { GameLevel } from '@jom/game-rage/levels';
import { Party } from './party.ts';
import type { Member, Result } from './party.ts';

export type { Result } from './party.ts';

export const MAX_PLAYERS = 4;
export const RACE_FRAMES = 120 * 60;
export const SABOTAGE_FRAMES = 90 * 60;
/** A client may run this far ahead of the server clock (input delay slack), no further. */
const LEAD_FRAMES = 6;
/** If a client stalls this far behind the clock, the server advances it on its last input. */
const LAG_FRAMES = 30;
/** Leadership changes only when the challenger is this far ahead (no flicker between two). */
const LEAD_MARGIN = 24_000;
/** SECURITY.md §4.2: more than 60 input changes in 3 seconds is not a human. */
export const DENSITY_WINDOW = 180;
export const DENSITY_MAX = 60;
export const SABOTAGE_BUDGET = 2;
export const SABOTAGE_COOLDOWN_MS = 2_000;
/** A trap may only be armed this far ahead of the runner (px): room to react, and no ambush. */
export const PLACE_MIN_AHEAD = 160;
export const PLACE_MAX_AHEAD = 900;

export interface Player extends Member {
  sim: SimState | null;
  /** Latest frame the client says it has simulated. */
  ack: number;
  /** Pending [frame, mask] changes, oldest first. */
  queue: Array<[number, number]>;
  mask: number;
  /** Frames of recent accepted input changes, for the density check. */
  changes: number[];
  gates: number;
  /** Gate changes applied to this player's sim: [frame, gates]. The client replays them. */
  gateLog: Array<[number, number]>;
  budget: number;
  nextPlaceAt: number;
}

export interface Standing {
  seat: number;
  place: number;
  cleared: boolean;
  frames: number | null;
  deaths: number;
  left: boolean;
}

export class Match extends Party<Player> {
  readonly mode: 'race' | 'sabotage';
  readonly maxPlayers = MAX_PLAYERS;
  level: GameLevel;
  /** Sabotage: armed slot bits. */
  armed = 0;
  runnerSeat = 0;
  leader: string | null = null;
  standings: Standing[] = [];
  winner: 'runner' | 'saboteurs' | null = null;

  constructor(mode: 'race' | 'sabotage') {
    super();
    this.mode = mode;
    this.level = (mode === 'race' ? RACE_LEVELS : SABOTAGE_LEVELS)[0]!;
  }

  protected blank(id: string, seat: number): Player {
    return {
      id,
      seat,
      connected: true,
      left: false,
      sim: null,
      ack: 0,
      queue: [],
      mask: 0,
      changes: [],
      strikes: 0,
      gates: 0,
      gateLog: [],
      budget: 0,
      nextPlaceAt: 0,
      nextEmoteAt: 0,
    };
  }

  start(by: string, now: number): Result {
    const r = this.begin(by, now);
    if (!r.ok) return r;
    const seats = [...this.players.values()]
      .filter((p) => p.connected)
      .map((p) => p.seat)
      .sort();
    this.runnerSeat = seats[(this.round - 1) % seats.length]!;
    this.armed = 0;
    this.leader = null;
    this.standings = [];
    this.winner = null;
    for (const p of this.players.values()) {
      Object.assign(p, this.blank(p.id, p.seat), { connected: p.connected });
      if (this.plays(p)) p.sim = createSimState(this.level.sim, 1);
      if (this.mode === 'sabotage' && !this.plays(p)) p.budget = SABOTAGE_BUDGET;
    }
    return { ok: true };
  }

  /** Who runs the level: everyone in a race, one runner in sabotage. */
  plays(p: Player): boolean {
    return this.mode === 'race' || p.seat === this.runnerSeat;
  }

  /** Per-tick input validation (SECURITY.md §5): shape, clock window, density. */
  input(id: string, frame: unknown, mask: unknown, now: number): Result {
    const p = this.players.get(id);
    if (!p?.sim || this.phase !== 'playing') return { ok: false, reason: 'not playing' };
    if (
      !Number.isInteger(frame) ||
      (frame as number) < 0 ||
      !Number.isInteger(mask) ||
      ((mask as number) & ~INPUT_MASK_ALL) !== 0
    ) {
      return this.strike(p, 'malformed input');
    }
    const f = frame as number;
    if (f > this.elapsed(now) + LEAD_FRAMES) return this.strike(p, 'input from the future');
    p.ack = Math.max(p.ack, f);
    const last = p.queue.length ? p.queue[p.queue.length - 1]![1] : p.mask;
    if (mask === last) return { ok: true }; // heartbeat
    p.changes.push(f);
    while (p.changes.length && p.changes[0]! < f - DENSITY_WINDOW) p.changes.shift();
    if (p.changes.length > DENSITY_MAX) return this.strike(p, 'superhuman input density');
    p.queue.push([Math.max(f, p.sim.frame), mask as number]);
    return { ok: true };
  }

  /** A saboteur arms a slot (SECURITY.md §5: budget, cooldown, legal position). */
  place(id: string, slot: unknown, now: number): Result {
    const p = this.players.get(id);
    const runner = this.runner();
    if (this.mode !== 'sabotage' || this.phase !== 'playing' || !p || !runner?.sim) {
      return { ok: false, reason: 'Not now.' };
    }
    if (this.plays(p)) return { ok: false, reason: 'The runner cannot place traps.' };
    if (!Number.isInteger(slot) || (slot as number) < 1 || (slot as number) > 30) {
      return this.strike(p, 'malformed slot');
    }
    const bit = 1 << (slot as number);
    const trap = this.level.sim.traps.find((t) => t.gate === bit);
    if (!trap) return { ok: false, reason: 'No such slot.' };
    if (this.armed & bit) return { ok: false, reason: 'Already armed.' };
    if (p.budget <= 0) return { ok: false, reason: 'No traps left.' };
    if (now < p.nextPlaceAt) return { ok: false, reason: 'Too soon.' };
    const ahead = toPx(trapX(trap) - runner.sim.player.x);
    if (ahead < PLACE_MIN_AHEAD || ahead > PLACE_MAX_AHEAD) {
      return { ok: false, reason: 'Out of range.' };
    }
    this.armed |= bit;
    p.budget--;
    p.nextPlaceAt = now + SABOTAGE_COOLDOWN_MS;
    return { ok: true };
  }

  runner(): Player | undefined {
    return [...this.players.values()].find((p) => p.seat === this.runnerSeat);
  }

  /** Advance every running sim to where its client (and the clock) allow; then check the end. */
  tick(now: number): void {
    if (this.phase !== 'playing') return;
    const clock = this.elapsed(now);
    this.updateLeader();
    for (const p of this.players.values()) {
      const sim = p.sim;
      if (!sim || p.left) continue;
      const target = Math.min(clock + LEAD_FRAMES, Math.max(p.ack, clock - LAG_FRAMES));
      const gates = this.gatesFor(p);
      if (gates !== p.gates) {
        p.gates = gates;
        p.gateLog.push([sim.frame, gates]);
      }
      sim.gates = gates;
      while (sim.frame < target && !sim.cleared) {
        while (p.queue.length && p.queue[0]![0] <= sim.frame) p.mask = p.queue.shift()![1];
        step(sim, p.mask, this.level.sim);
      }
    }
    this.checkEnd(clock);
  }

  gatesFor(p: Player): number {
    return this.mode === 'race' ? (this.leader === p.id ? LEADER_GATE : 0) : this.armed;
  }

  private updateLeader(): void {
    if (this.mode !== 'race') return;
    const racing = [...this.players.values()].filter((p) => p.sim && !p.left && !p.sim.cleared);
    const front = racing.reduce<Player | null>(
      (a, p) => (!a || p.sim!.player.x > a.sim!.player.x ? p : a),
      null,
    );
    const current = racing.find((p) => p.id === this.leader);
    if (!front || racing.length < 2) this.leader = null;
    else if (!current || front.sim!.player.x > current.sim!.player.x + LEAD_MARGIN) {
      this.leader = front.id;
    }
  }

  private checkEnd(clock: number): void {
    if (this.mode === 'sabotage') {
      const r = this.runner();
      if (r?.sim?.cleared) this.finish('runner');
      else if (!r || r.left || clock >= SABOTAGE_FRAMES) this.finish('saboteurs');
      return;
    }
    const going = [...this.players.values()].filter((p) => p.sim && !p.left && !p.sim.cleared);
    if (going.length === 0 || clock >= RACE_FRAMES) this.finish(null);
  }

  private finish(winner: 'runner' | 'saboteurs' | null): void {
    this.phase = 'results';
    this.winner = winner;
    const rank = (p: Player) =>
      p.left ? 3e9 : p.sim!.cleared ? p.sim!.clearFrame : 2e9 - p.sim!.player.x / 1000;
    this.standings = [...this.players.values()]
      .filter((p) => p.sim)
      .sort((a, b) => rank(a) - rank(b))
      .map((p, i) => ({
        seat: p.seat,
        place: i + 1,
        cleared: p.sim!.cleared,
        frames: p.sim!.cleared ? p.sim!.clearFrame : null,
        deaths: p.sim!.deaths,
        left: p.left,
      }));
  }

  /**
   * What everyone sees at 20Hz: positions and scores, never another player's inputs. It also
   * carries each runner's truth (for their reconciliation) and, in Sabotage, the runner's state
   * for the saboteurs to watch: one socket write per player per beat, not three (the load test
   * found per-message writes to be half the server's CPU).
   */
  snapshot(now: number) {
    const runner = this.mode === 'sabotage' ? this.runner() : undefined;
    return {
      phase: this.phase,
      clock: this.phase === 'playing' ? this.elapsed(now) : 0,
      armed: this.armed,
      leader: this.leader ? (this.players.get(this.leader)?.seat ?? null) : null,
      truths: [...this.players.values()].flatMap((p) => {
        const t = this.truth(p.id);
        return t ? [{ seat: p.seat, ...t }] : [];
      }),
      watch: runner?.sim ?? null,
      players: [...this.players.values()].map((p) => ({
        seat: p.seat,
        connected: p.connected,
        left: p.left,
        x: p.sim?.player.x ?? 0,
        y: p.sim?.player.y ?? 0,
        big: p.sim?.big ?? 0,
        gravity: p.sim?.gravity ?? 1,
        attempt: p.sim?.attempt ?? 0,
        cleared: p.sim?.cleared ?? false,
      })),
    };
  }

  /** For one player's reconciliation: the server's frame, state hash and gate history. */
  truth(id: string) {
    const p = this.players.get(id);
    if (!p?.sim) return null;
    return { frame: p.sim.frame, hash: hashState(p.sim), gates: p.gateLog };
  }
}

/** Where a trap sits along the level (sim units), for the "ahead of the runner" rule. */
function trapX(t: GameLevel['sim']['traps'][number]): number {
  return 'rect' in t ? t.rect.x : 'triggerX' in t ? t.triggerX : 0;
}
