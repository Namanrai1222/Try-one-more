import {
  INPUT_MASK_ALL,
  Input,
  InputReplayer,
  LEADER_GATE,
  STEP_MS,
  createSimState,
  hashState,
  step,
  toFixed,
} from '@jom/engine';
import type { InputLog } from '@jom/engine';
import { describe, expect, it } from 'vitest';
import solutions from '../../../packages/game-rage/levels/solutions.json' with { type: 'json' };
import { Match, PLACE_MIN_AHEAD, SABOTAGE_BUDGET, SABOTAGE_COOLDOWN_MS } from '../src/match.ts';

const T0 = 1_000_000;
/** 1ms into frame `f`, so float rounding never lands on the previous frame. */
const at = (frame: number) => T0 + frame * STEP_MS + 1;
const recorded = solutions as unknown as Record<string, { frames: number; inputLog: InputLog }>;

function lobby(mode: 'race' | 'sabotage', n: number) {
  const m = new Match(mode);
  for (let i = 0; i < n; i++) m.join(`p${i}`);
  return m;
}

/** Drive players' inputs frame by frame, as clients would, ticking the server each frame. */
function play(m: Match, masks: Record<string, (f: number) => number>, frames: number) {
  for (let f = 0; f < frames && m.phase === 'playing'; f++) {
    for (const [id, mask] of Object.entries(masks)) m.input(id, f, mask(f), at(f));
    m.tick(at(f + 1));
  }
}

describe('lobby', () => {
  it('seats up to four, the first in is host, and only the host starts with two or more', () => {
    const m = lobby('race', 1);
    expect(m.start('p0', T0)).toEqual({ ok: false, reason: 'Two players are needed.' });
    for (let i = 1; i < 4; i++) expect(m.join(`p${i}`)).toEqual({ ok: true, seat: i });
    expect(m.join('p4').ok).toBe(false);
    expect(m.start('p1', T0).ok).toBe(false);
    expect(m.start('p0', T0).ok).toBe(true);
    expect(m.join('late').ok).toBe(false);
  });

  it('hands the host on when the host leaves the lobby', () => {
    const m = lobby('race', 2);
    m.leave('p0');
    expect(m.host).toBe('p1');
  });
});

describe('race', () => {
  const run = recorded['mp-race-01-front-runner']!;

  it('the server alone decides the outcome, from inputs', () => {
    const m = lobby('race', 2);
    m.start('p0', T0);
    const replay = new InputReplayer(run.inputLog);
    play(m, { p0: (f) => replay.maskAt(f), p1: () => Input.None }, run.frames + 60);
    // p0 led (and got the leader traps), yet the worst-case run still clears; p1 never moved.
    expect(m.players.get('p0')!.gateLog.some(([, g]) => g === LEADER_GATE)).toBe(true);
    m.tick(at(120 * 60 + 1)); // time limit
    expect(m.phase).toBe('results');
    expect(m.standings.map((s) => [s.seat, s.cleared])).toEqual([
      [0, true],
      [1, false],
    ]);
  });

  it('a client replaying its inputs and the gate log lands on the server state exactly', () => {
    const m = lobby('race', 2);
    m.start('p0', T0);
    const replay = new InputReplayer(run.inputLog);
    const rush = (f: number) => (f < 200 ? Input.Right : Input.None);
    play(m, { p0: (f) => replay.maskAt(f), p1: rush }, 300);
    const logs: Record<string, InputLog> = {
      p0: run.inputLog,
      p1: [
        [0, Input.Right],
        [200, Input.None],
      ],
    };
    for (const pid of ['p0', 'p1']) {
      const truth = m.truth(pid)!;
      const s = createSimState(m.level.sim, 1);
      const mine = new InputReplayer(logs[pid]!);
      const gates = [...truth.gates];
      while (s.frame < truth.frame) {
        while (gates.length && gates[0]![0] <= s.frame) s.gates = gates.shift()![1];
        step(s, mine.maskAt(s.frame), m.level.sim);
      }
      expect(hashState(s)).toBe(truth.hash);
    }
  });

  it('leaving mid-race is a loss', () => {
    const m = lobby('race', 2);
    m.start('p0', T0);
    play(m, { p0: () => Input.Right, p1: () => Input.None }, 30);
    m.leave('p0');
    m.tick(at(120 * 60 + 1));
    expect(m.standings.at(-1)).toMatchObject({ seat: 0, left: true });
  });
});

describe('input validation (SECURITY.md §5)', () => {
  it('rejects malformed masks and inputs from the future', () => {
    const m = lobby('race', 2);
    m.start('p0', T0);
    expect(m.input('p0', 0, INPUT_MASK_ALL + 1, at(0)).ok).toBe(false);
    expect(m.input('p0', 1.5, 0, at(0)).ok).toBe(false);
    expect(m.input('p0', 100, Input.Right, at(0))).toEqual({
      ok: false,
      reason: 'input from the future',
    });
    expect(m.input('p0', 0, Input.Right, at(0)).ok).toBe(true);
  });

  it('rejects superhuman input density, and kicks a persistent offender', () => {
    const m = lobby('race', 2);
    m.start('p0', T0);
    const reasons: string[] = [];
    for (let f = 0; f < 200; f++) {
      const r = m.input('p0', f, f % 2 ? Input.Right : 0, at(f));
      if (!r.ok) reasons.push(r.reason);
    }
    expect(reasons).toContain('superhuman input density');
    expect(reasons.at(-1)).toBe('kick');
  });
});

describe('sabotage', () => {
  it('validates who, budget, cooldown, range and repeats; an armed slot is live for the runner', () => {
    const m = lobby('sabotage', 3);
    m.start('p0', T0); // round 1: seat 0 runs
    expect(m.place('p0', 1, T0).ok).toBe(false); // the runner can't place
    expect(m.place('p1', 9, T0)).toEqual({ ok: false, reason: 'No such slot.' });
    expect(m.place('p1', 3, T0)).toEqual({ ok: false, reason: 'Out of range.' }); // x 1050: too far
    // slot 1 spikes at x 300, runner at spawn (48): 252px ahead, inside [160, 900]
    expect(PLACE_MIN_AHEAD).toBeLessThan(252);
    expect(m.place('p1', 1, T0).ok).toBe(true);
    expect(m.place('p2', 1, T0)).toEqual({ ok: false, reason: 'Already armed.' });
    expect(m.place('p1', 2, T0 + 10)).toEqual({ ok: false, reason: 'Too soon.' });
    expect(m.place('p1', 2, T0 + SABOTAGE_COOLDOWN_MS).ok).toBe(true);
    expect(SABOTAGE_BUDGET).toBe(2);
    expect(m.place('p1', 3, T0 + 2 * SABOTAGE_COOLDOWN_MS)).toEqual({
      ok: false,
      reason: 'No traps left.',
    });
    // The runner holds Right into the armed spikes and dies there, on the server.
    play(m, { p0: () => Input.Right }, 120);
    const sim = m.runner()!.sim!;
    expect(sim.deaths).toBeGreaterThan(0);
    expect(sim.lastDeath.x).toBeGreaterThan(toFixed(250));
  });

  it('saboteurs win if the runner leaves; the runner rotates each round', () => {
    const m = lobby('sabotage', 2);
    m.start('p0', T0);
    expect(m.runnerSeat).toBe(0);
    m.leave('p0');
    m.tick(at(1));
    expect(m.winner).toBe('saboteurs');
    m.next(m.host!);
    m.join('p2'); // takes the freed seat 0
    m.start(m.host!, T0);
    expect(m.runnerSeat).toBe(1); // round 2 → the second seat in order
  });
});

describe('emotes', () => {
  it('only the fixed set, at most one a second', () => {
    const m = lobby('race', 1);
    expect(m.emote('p0', 8, T0).ok).toBe(false);
    expect(m.emote('p0', 'hello', T0).ok).toBe(false);
    expect(m.emote('p0', 3, T0).ok).toBe(true);
    expect(m.emote('p0', 3, T0 + 500).ok).toBe(false);
    expect(m.emote('p0', 3, T0 + 1000).ok).toBe(true);
  });
});
