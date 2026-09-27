import { describe, expect, it } from 'vitest';
import {
  Input,
  PHYSICS,
  PLAYER_H,
  PLAYER_W,
  SimEvent,
  compileLevel,
  createSimState,
  nextRandom,
  overlaps,
  step,
  toFixed,
} from '../src/index.ts';
import type { LevelFile, SimLevel, SimState } from '../src/index.ts';

type Geo = Pick<LevelFile, 'bounds' | 'spawn' | 'solids'> & Partial<LevelFile>;
const lvl = (id: string, geo: Geo): SimLevel =>
  compileLevel({ schema: 1, id, chapter: 0, index: 0, name: id, ...geo });

const floorLevel = lvl('test-floor', {
  bounds: { w: 320, h: 240 },
  spawn: { x: 32, y: 100 },
  solids: [{ x: 0, y: 200, w: 320, h: 40 }],
});

function run(state: SimState, mask: number, frames: number, level: SimLevel = floorLevel) {
  let events = 0;
  let jumps = 0;
  for (let i = 0; i < frames; i++) {
    const e = step(state, mask, level);
    events |= e;
    if (e & SimEvent.Jumped) jumps++;
  }
  return { events, jumps };
}

function landed(level: SimLevel = floorLevel): SimState {
  const s = createSimState(level, 1);
  run(s, Input.None, 90, level);
  return s;
}

describe('sim physics', () => {
  it('falls under gravity and lands flush on the floor', () => {
    const s = createSimState(floorLevel, 1);
    const { events } = run(s, Input.None, 90);
    expect(s.player.y).toBe(toFixed(200) - PLAYER_H);
    expect(s.player.onGround).toBe(true);
    expect(s.player.vy).toBe(0);
    expect(events & SimEvent.Landed).toBeTruthy();
  });

  it('keeps every position and velocity an integer', () => {
    const s = landed();
    run(s, Input.Right | Input.Jump, 7);
    run(s, Input.Right, 11);
    for (const v of [s.player.x, s.player.y, s.player.vx, s.player.vy]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('caps horizontal speed at runMax', () => {
    const s = landed();
    run(s, Input.Right, 10);
    expect(s.player.vx).toBe(PHYSICS.runMax);
  });

  it('ground friction brings the player to rest', () => {
    const s = landed();
    run(s, Input.Right, 10);
    run(s, Input.None, 10);
    expect(s.player.vx).toBe(0);
  });

  it('jumps once per press, not while held', () => {
    const s = landed();
    const { jumps } = run(s, Input.Jump, 120);
    expect(jumps).toBe(1);
  });

  it('releasing jump early gives a lower jump than holding it', () => {
    const apex = (holdFrames: number) => {
      const s = landed();
      let minY = s.player.y;
      for (let i = 0; i < 60; i++) {
        step(s, i < holdFrames ? Input.Jump : Input.None, floorLevel);
        minY = Math.min(minY, s.player.y);
      }
      return minY;
    };
    expect(apex(3)).toBeGreaterThan(apex(30));
  });

  it('walls stop horizontal movement flush against them', () => {
    const walled = lvl('test-wall', {
      bounds: { w: 320, h: 240 },
      spawn: { x: 32, y: 100 },
      solids: [
        { x: 0, y: 200, w: 320, h: 40 },
        { x: 160, y: 100, w: 16, h: 100 },
      ],
    });
    const s = landed(walled);
    run(s, Input.Right, 120, walled);
    expect(s.player.x).toBe(toFixed(160) - PLAYER_W);
  });

  it('falling out of the world counts a death and respawns at spawn', () => {
    const pit = lvl('test-pit', {
      bounds: { w: 320, h: 240 },
      spawn: { x: 32, y: 100 },
      solids: [],
    });
    const s = createSimState(pit, 1);
    const { events } = run(s, Input.None, 60, pit);
    expect(events & SimEvent.Died).toBeTruthy();
    expect(s.deaths).toBeGreaterThanOrEqual(1);
  });

  it('respawn resets position and velocity exactly', () => {
    const pit = lvl('test-pit', {
      bounds: { w: 320, h: 240 },
      spawn: { x: 32, y: 100 },
      solids: [],
    });
    const s = createSimState(pit, 1);
    for (let i = 0; i < 200; i++) {
      if (step(s, Input.Right, pit) & SimEvent.Died) break;
    }
    expect(s.player).toEqual({
      x: pit.spawn.x,
      y: pit.spawn.y,
      vx: 0,
      vy: 0,
      onGround: false,
      floor: -1,
    });
  });

  it('nextRandom is seeded and advances sim state', () => {
    const a = createSimState(floorLevel, 42);
    const b = createSimState(floorLevel, 42);
    const seqA = [nextRandom(a, 100), nextRandom(a, 100), nextRandom(a, 100)];
    const seqB = [nextRandom(b, 100), nextRandom(b, 100), nextRandom(b, 100)];
    expect(seqA).toEqual(seqB);
    expect(a.rng).not.toBe(42);
  });
});

describe('aabb', () => {
  const box = { x: 10, y: 10, w: 10, h: 10 };
  it('detects overlap', () => expect(overlaps(15, 15, 10, 10, box)).toBe(true));
  it('treats touching edges as not overlapping', () => {
    expect(overlaps(20, 10, 10, 10, box)).toBe(false);
    expect(overlaps(10, 0, 10, 10, box)).toBe(false);
  });
});
