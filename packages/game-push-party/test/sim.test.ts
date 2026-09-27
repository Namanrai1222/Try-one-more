import { FP } from '@jom/engine';
import { describe, expect, it } from 'vitest';
import {
  ARENA,
  CRUMBLE_FRAMES,
  FALLING_RINGS,
  FALL_FRAMES,
  FIRST_RING_AT,
  GRID,
  PushEvent,
  PushInput,
  RING_EVERY,
  ROUND_FRAMES,
  createPushState,
  isOver,
  isqrt,
  placings,
  stepPush,
  tileAt,
} from '../src/sim.ts';
import type { PushState } from '../src/sim.ts';

/** A seeded mash of inputs (test-side randomness only; the sim never draws random numbers). */
function mash(seed: number, players: number, frames: number): number[][] {
  let s = seed;
  const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
  let masks = Array<number>(players).fill(0);
  return Array.from({ length: frames }, () => {
    if (next() % 8 === 0) masks = masks.map(() => next() % 32);
    return masks;
  });
}

function run(seats: number[], inputs: number[][]): PushState {
  const s = createPushState(seats);
  for (const m of inputs) stepPush(s, m);
  return s;
}

const centre = ARENA / 2;

describe('push party sim', () => {
  it('is deterministic and integer-only', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const inputs = mash(seed, 8, 3000);
      const a = run([0, 1, 2, 3, 4, 5, 6, 7], inputs);
      const b = run([7, 6, 5, 4, 3, 2, 1, 0], inputs); // seat order is normalised
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      for (const p of a.pushers) {
        for (const v of [p.x, p.y, p.vx, p.vy, p.fx, p.fy]) expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it('walks at a capped speed, the same on diagonals', () => {
    const s = createPushState([0, 4]);
    // 50 frames: at top speed, still on the floor (much longer and seat 0 walks off the edge).
    for (let f = 0; f < 50; f++) stepPush(s, [PushInput.Up, PushInput.Up | PushInput.Right]);
    expect(s.pushers.every((p) => p.fall === 0)).toBe(true);
    const [a, b] = s.pushers;
    expect(Math.abs(a!.vy)).toBeGreaterThan(3 * FP);
    expect(Math.abs(a!.vy)).toBeLessThan(4 * FP);
    const diagonal = isqrt(b!.vx * b!.vx + b!.vy * b!.vy);
    expect(Math.abs(diagonal - Math.abs(a!.vy))).toBeLessThan(FP / 10);
  });

  it('a shove that connects knocks the other player away; a second press needs a release', () => {
    const s = createPushState([0, 4]); // seat 0 east of centre, seat 4 west, facing each other
    const [east, west] = s.pushers;
    west!.x = centre - 60 * FP;
    east!.x = centre;
    let events = stepPush(s, [0, PushInput.Shove]);
    expect(events & PushEvent.Shoved).toBeTruthy();
    for (let f = 0; f < 8 && !(events & PushEvent.Hit); f++) {
      events = stepPush(s, [0, PushInput.Shove]); // still held: no second lunge
    }
    expect(events & PushEvent.Hit).toBeTruthy();
    expect(east!.vx).toBeGreaterThan(6 * FP);
    expect(west!.cooldown).toBeGreaterThan(0);
  });

  it('walking off the edge is a fall, then out; the last one standing wins', () => {
    const s = createPushState([0, 4]);
    let events = 0;
    for (let f = 0; f < 200 && !isOver(s); f++) events |= stepPush(s, [PushInput.Right, 0]);
    expect(events & PushEvent.Fell).toBeTruthy();
    expect(events & PushEvent.Out).toBeTruthy();
    expect(isOver(s)).toBe(true);
    const [east] = s.pushers;
    expect(east!.out).toBe(true);
    expect(east!.outFrame).toBeGreaterThanOrEqual(FALL_FRAMES);
    expect(placings(s)).toEqual([
      { seat: 0, place: 2, out: true },
      { seat: 4, place: 1, out: false },
    ]);
  });

  it('drops the floor ring by ring and never the centre', () => {
    const edge = FIRST_RING_AT;
    expect(tileAt(edge - 1, 0, 5)).toBe(0);
    expect(tileAt(edge, 0, 5)).toBe(CRUMBLE_FRAMES); // shaking, still holds
    expect(tileAt(edge + CRUMBLE_FRAMES, 0, 5)).toBe(-1);
    expect(tileAt(edge + CRUMBLE_FRAMES, 1, 5)).toBe(0); // next ring waits
    const last = FIRST_RING_AT + (FALLING_RINGS - 1) * RING_EVERY + CRUMBLE_FRAMES;
    let solid = 0;
    for (let i = 0; i < GRID; i++)
      for (let j = 0; j < GRID; j++) solid += +(tileAt(last, i, j) === 0);
    expect(solid).toBe(4);
    expect(tileAt(ROUND_FRAMES * 10, 4, 5)).toBe(0);
    expect(tileAt(0, -1, 3)).toBe(-1);
  });

  it('standing still on a falling ring drops you; survivors at the bell share first place', () => {
    const s = createPushState([0, 2, 4]); // all spawn on ring 1
    while (!isOver(s)) stepPush(s, []);
    expect(s.pushers.every((p) => p.out)).toBe(true);
    expect(s.frame).toBeLessThan(ROUND_FRAMES);
    expect(placings(s).map((p) => p.place)).toEqual([1, 1, 1]); // fell together: a tie
  });

  it('ignores bits outside the five inputs and seats outside 0–7', () => {
    const a = createPushState([0, 9, -1, 1.5]);
    expect(a.pushers.map((p) => p.seat)).toEqual([0]);
    const b = createPushState([0]);
    stepPush(a, [0xffff_ffe0]);
    stepPush(b, [0]);
    expect(a).toEqual(b);
  });
});
