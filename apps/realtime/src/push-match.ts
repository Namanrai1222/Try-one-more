/**
 * Push Party's rules on the server (PRD.md §4.9): one shared arena that the server steps at
 * 60Hz from each player's latest input. Unlike the platformer, bodies touch, so there is one
 * sim, not one per player. Clients predict it from the snapshots (see game-push-party/game.ts).
 *
 * Inputs are stamped with the client's frame. One that arrives early waits for its frame; one
 * that arrives late applies now, and the snapshot tells that client how late it was (`late`),
 * so it can run further ahead and have its inputs land on time.
 */
import {
  MAX_PUSHERS,
  PUSH_MASK_ALL,
  ROUND_FRAMES,
  createPushState,
  isOver,
  placings,
  stepPush,
} from '@jom/game-push-party/sim';
import type { PushState } from '@jom/game-push-party/sim';
import { DENSITY_MAX, DENSITY_WINDOW } from './match.ts';
import { Party } from './party.ts';
import type { Member, Result } from './party.ts';

/** How far ahead of the server a client may stamp its inputs. */
const LEAD_FRAMES = 12;
/** A player not heard from for this long (a hidden tab, a dropped link) lets go of the keys. */
const STALE_FRAMES = 30;

export interface Pushing extends Member {
  /** Index into `state.pushers`, or -1 when not in this round. */
  index: number;
  queue: Array<[number, number]>;
  mask: number;
  changes: number[];
  /** Server frame when this player's last input arrived, and how late its stamp was. */
  heard: number;
  late: number;
}

export interface PushStanding {
  seat: number;
  place: number;
  out: boolean;
  left: boolean;
}

export class PushMatch extends Party<Pushing> {
  readonly mode = 'push' as const;
  readonly maxPlayers = MAX_PUSHERS;
  state: PushState | null = null;
  /** The masks the last step used, by pusher index: clients predict the others with these. */
  masks: number[] = [];
  standings: PushStanding[] = [];
  readonly winner = null;

  protected blank(id: string, seat: number): Pushing {
    return {
      id,
      seat,
      connected: true,
      left: false,
      strikes: 0,
      nextEmoteAt: 0,
      index: -1,
      queue: [],
      mask: 0,
      changes: [],
      heard: 0,
      late: 0,
    };
  }

  plays(p: Pushing): boolean {
    return p.index >= 0;
  }

  start(by: string, now: number): Result {
    const r = this.begin(by, now);
    if (!r.ok) return r;
    const active = [...this.players.values()].filter((p) => p.connected);
    const state = createPushState(active.map((p) => p.seat));
    this.state = state;
    this.masks = state.pushers.map(() => 0);
    this.standings = [];
    for (const p of this.players.values()) {
      Object.assign(p, this.blank(p.id, p.seat), { connected: p.connected });
      p.index = p.connected ? state.pushers.findIndex((q) => q.seat === p.seat) : -1;
    }
    return { ok: true };
  }

  input(id: string, frame: unknown, mask: unknown, now: number): Result {
    const p = this.players.get(id);
    const state = this.state;
    if (!p || !state || this.phase !== 'playing' || p.index < 0) {
      return { ok: false, reason: 'not playing' };
    }
    if (
      !Number.isInteger(frame) ||
      (frame as number) < 0 ||
      !Number.isInteger(mask) ||
      ((mask as number) & ~PUSH_MASK_ALL) !== 0
    ) {
      return this.strike(p, 'malformed input');
    }
    const f = frame as number;
    // Checked against wall time, not the sim frame, so a server that is catching up is fair.
    if (f > this.elapsed(now) + LEAD_FRAMES) return this.strike(p, 'input from the future');
    p.heard = state.frame;
    p.late = state.frame - f;
    const last = p.queue.length ? p.queue[p.queue.length - 1]![1] : p.mask;
    if (mask === last) return { ok: true }; // heartbeat
    p.changes.push(f);
    while (p.changes.length && p.changes[0]! < f - DENSITY_WINDOW) p.changes.shift();
    if (p.changes.length > DENSITY_MAX) return this.strike(p, 'superhuman input density');
    p.queue.push([Math.max(f, state.frame), mask as number]);
    return { ok: true };
  }

  tick(now: number): void {
    const state = this.state;
    if (this.phase !== 'playing' || !state) return;
    const bySeat = new Map([...this.players.values()].map((p) => [p.seat, p]));
    const target = Math.min(this.elapsed(now), ROUND_FRAMES);
    while (state.frame < target && !isOver(state)) {
      this.masks = state.pushers.map((q) => {
        const p = bySeat.get(q.seat);
        if (!p || p.left) {
          // Leaving is a loss (SECURITY.md §5): out, and ranked below anyone who fell.
          if (!q.out) Object.assign(q, { out: true, outFrame: -1 });
          return 0;
        }
        while (p.queue.length && p.queue[0]![0] <= state.frame) p.mask = p.queue.shift()![1];
        return state.frame - p.heard > STALE_FRAMES ? 0 : p.mask;
      });
      stepPush(state, this.masks);
    }
    if (isOver(state)) this.finish(bySeat);
  }

  private finish(bySeat: Map<number, Pushing>): void {
    this.phase = 'results';
    this.standings = placings(this.state!)
      .map((s) => ({ ...s, left: bySeat.get(s.seat)?.left ?? true }))
      .sort((a, b) => a.place - b.place);
  }

  snapshot(now: number) {
    const bySeat = new Map([...this.players.values()].map((p) => [p.seat, p]));
    return {
      phase: this.phase,
      clock: this.phase === 'playing' ? this.elapsed(now) : 0,
      state: this.state,
      masks: this.masks,
      late: this.state?.pushers.map((q) => bySeat.get(q.seat)?.late ?? 0) ?? [],
    };
  }
}
