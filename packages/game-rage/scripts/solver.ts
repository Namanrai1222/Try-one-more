/**
 * Level solver: a beam search over short held inputs that finds a zero-death clear with the
 * real engine. Used by `solve.ts` (writes levels/solutions.json) and by the Daily Trap tests
 * (every generated level must be clearable). Dev tooling — never shipped to players.
 */
import {
  Input,
  InputRecorder,
  InputReplayer,
  SimEvent,
  createSimState,
  goalRect,
  playerSize,
  step,
} from '@jom/engine';
import type { InputLog, SimLevel, SimState } from '@jom/engine';

// Every left/right/jump combination: under shuffled bindings any physical key can mean anything.
const MOVES = [
  Input.Right,
  Input.Right | Input.Jump,
  Input.None,
  Input.Jump,
  Input.Left,
  Input.Left | Input.Jump,
  Input.Left | Input.Right,
  Input.Left | Input.Right | Input.Jump,
];
const HOLD = 5; // frames per move
const BEAM = 400;
/**
 * At most this many beam slots per 16px cell (and world state). Without it the beam fills
 * with near-identical runners that all walk into the same trap, and the jumpers are pruned.
 */
const PER_CELL = 6;
const MAX_MOVES = 480; // 40 seconds

interface Node {
  s: SimState;
  move: number;
  parent: Node | null;
  /** Input switches so far (a human-like route switches rarely). */
  changes: number;
  /**
   * Robust mode: "human twins" — the same moves, but each key switch lands `lags[i]` frames
   * late (negative: early). A route only survives if its twins do too.
   */
  twins: SimState[];
  lags: number[];
}

/** A twin's timing error at a switch: fixed per (twin, depth), in [-spread, spread]. */
function lagFor(twin: number, depth: number, spread: number): number {
  const h = Math.imul(twin + 1, 2_654_435_761) ^ Math.imul(depth + 1, 40_503);
  return ((h >>> 0) % (2 * spread + 1)) - spread;
}

function score(s: SimState, level: SimLevel): number {
  const g = goalRect(s, level);
  if (!g) return 0;
  const { w, h } = playerSize(s);
  const px = s.player.x + w / 2;
  const py = s.player.y + h / 2;
  // A door that ran away (goalShift) is progress, not a setback: without this the beam hovers
  // just outside the trigger distance and records a jittery, unteachable route (level 22).
  return Math.abs(g.x + g.w / 2 - px) + Math.abs(g.y + g.h / 2 - py) - Math.abs(s.goalShift);
}

/**
 * How well a recorded run survives human timing: the share (0–1) of `variants` replays, with
 * every key switch moved by a random ±`spread` frames, that still clear with no death. Seeded,
 * so the same run always scores the same.
 */
export function timingTolerance(
  level: SimLevel,
  run: { frames: number; inputLog: InputLog },
  { variants = 200, spread = 2, seed = 12_345, gates = 0, attempt = 1 } = {},
): number {
  let rng = seed;
  const random = () => (rng = (Math.imul(rng, 1_664_525) + 1_013_904_223) >>> 0) / 2 ** 32;
  let cleared = 0;
  for (let v = 0; v < variants; v++) {
    const log: Array<[number, number]> = [];
    for (const [f, m] of run.inputLog) {
      const g = Math.max(0, f + Math.round((random() * 2 - 1) * spread));
      if (log.length && g <= log[log.length - 1]![0]) continue; // collided: a missed press
      log.push([g, m]);
    }
    const s = createSimState(level, 1, attempt);
    s.gates = gates;
    const replayer = new InputReplayer(log);
    for (let f = 0; f < run.frames + 120 && !s.cleared && !s.deaths; f++) {
      step(s, replayer.maskAt(f), level);
    }
    if (s.cleared && !s.deaths) cleared++;
  }
  return cleared / variants;
}

/** Levels where the same place at a different time is a different situation. */
const timed = (level: SimLevel) =>
  level.traps.some((t) => t.type === 'timer' || t.type === 'shuffle' || t.type === 'clone');

function key(s: SimState, withTime: boolean): string {
  const p = s.player;
  const c = s.clone;
  const traps = s.traps.map((t) => `${t.fired}${t.timer}${t.y >> 10}`).join('');
  return [
    p.x >> 9,
    p.y >> 9,
    p.vx,
    p.vy,
    s.prevMask,
    s.gravity,
    s.big,
    s.invert,
    s.freeze,
    c.active ? `${c.x >> 9},${c.y >> 9}` : '',
    withTime ? s.attemptFrame : '',
    s.gone.join(''),
    traps,
  ].join('|');
}

function toLog(end: Node, frames: number): { frames: number; inputLog: InputLog } {
  const moves: number[] = [];
  for (let n: Node | null = end; n?.parent; n = n.parent) moves.unshift(n.move);
  const rec = new InputRecorder();
  moves.forEach((m, i) => {
    for (let f = 0; f < HOLD; f++) rec.record(i * HOLD + f, m);
  });
  return { frames, inputLog: rec.log };
}

/** Every gate bit a level uses (0 for solo levels). */
export const allGates = (level: SimLevel) => level.traps.reduce((m, t) => m | (t.gate ?? 0), 0);

/**
 * `gates`: multiplayer gate bits held on for the whole run (all on = the worst case).
 * `changeCost`: sim units of distance each input switch costs in the ranking. Above 0 the
 * search prefers steady, human-like input over frame-perfect jiggling (used for the recorded
 * runs players can watch); 0 finds any clear fastest (the Daily Trap checks).
 * `twins` / `spread`: robust mode — keep only routes that `twins` copies with every key switch
 * moved by up to ±`spread` frames also survive (a route a person can copy). 0 = off.
 * `attempt`: solve the level as it is on that attempt (traps scoped with `when`).
 */
export function solve(
  level: SimLevel,
  { seed = 1, gates = 0, changeCost = 0, twins = 0, spread = 2, attempt = 1 } = {},
): { frames: number; inputLog: InputLog } | null {
  const withTime = timed(level);
  const start = createSimState(level, seed, attempt);
  start.gates = gates;
  let beam: Node[] = [
    {
      s: start,
      move: 0,
      parent: null,
      changes: 0,
      twins: Array.from({ length: twins }, () => structuredClone(start)),
      lags: Array.from({ length: twins }, () => 0),
    },
  ];
  const seen = new Set<string>();
  let rng = 1; // fixed seed: the same level always yields the same recording
  for (let depth = 0; depth < MAX_MOVES && beam.length > 0; depth++) {
    const next: { node: Node; score: number }[] = [];
    for (const node of beam) {
      for (const move of MOVES) {
        const s = structuredClone(node.s);
        let dead = false;
        for (let f = 0; f < HOLD && !s.cleared; f++) {
          if (step(s, move, level) & SimEvent.Died) {
            dead = true;
            break;
          }
        }
        if (dead) continue;
        // Twins: a switch lands lag frames off; holding the same keys is no switch at all.
        const lags = node.lags.map((lag, i) =>
          move === node.move ? lag : lagFor(i, depth, spread),
        );
        const twinStates: SimState[] = [];
        for (let i = 0; i < node.twins.length && !dead; i++) {
          const t = structuredClone(node.twins[i]!);
          const frames = HOLD + lags[i]! - node.lags[i]!;
          for (let f = 0; f < frames && !t.cleared; f++) {
            if (step(t, move, level) & SimEvent.Died) {
              dead = true;
              break;
            }
          }
          twinStates.push(t);
        }
        if (dead) continue;
        const changes = node.changes + (move === node.move ? 0 : 1);
        const child = { s, move, parent: node, changes, twins: twinStates, lags };
        if (s.cleared) return toLog(child, s.clearFrame);
        const k = key(s, withTime);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ node: child, score: score(s, level) + changes * changeCost });
      }
    }
    next.sort((a, b) => a.score - b.score);
    const perCell = new Map<string, number>();
    const pool: Node[] = [];
    for (const { node } of next) {
      const { s } = node;
      const cell = `${s.player.x >> 14}|${s.player.y >> 14}|${s.gravity}|${s.big}|${s.gone.join('')}`;
      const n = perCell.get(cell) ?? 0;
      if (n >= PER_CELL) continue;
      perCell.set(cell, n + 1);
      pool.push(node);
    }
    // The best three quarters by distance, plus a seeded sample of the rest: states that
    // look closest (e.g. already falling past a ledge) are often doomed.
    const best = Math.floor(BEAM * 0.75);
    beam = pool.slice(0, best);
    const rest = pool.slice(best);
    for (let i = 0; i < BEAM - best && rest.length > 0; i++) {
      rng = (Math.imul(rng, 1_103_515_245) + 12_345) >>> 0;
      beam.push(rest.splice(rng % rest.length, 1)[0]!);
    }
  }
  return null;
}
