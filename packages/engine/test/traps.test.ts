import { describe, expect, it } from 'vitest';
import {
  DeathCause,
  HAZARD_INSET,
  Input,
  PLAYER_W,
  SimEvent,
  compileLevel,
  createSimState,
  goalRect,
  step,
  toFixed,
} from '../src/index.ts';
import type { LevelFile, SimLevel, SimState, TrapFile } from '../src/index.ts';

const base = (traps: TrapFile[], extra: Partial<LevelFile> = {}): SimLevel =>
  compileLevel({
    schema: 1,
    id: 'traps',
    chapter: 0,
    index: 0,
    name: 'traps',
    bounds: { w: 480, h: 240 },
    spawn: { x: 16, y: 160 },
    goal: { x: 440, y: 168, w: 24, h: 32 },
    solids: [
      { id: 'a', x: 0, y: 200, w: 160, h: 40 },
      { id: 'drop', x: 160, y: 200, w: 64, h: 40 },
      { id: 'b', x: 224, y: 200, w: 256, h: 40 },
    ],
    traps,
    ...extra,
  });

/** Hold `mask` until an event bit fires or the frame budget runs out. */
function until(s: SimState, level: SimLevel, mask: number, bit: number, max = 600): boolean {
  for (let i = 0; i < max; i++) if (step(s, mask, level) & bit) return true;
  return false;
}

describe('goal', () => {
  it('reaching the goal clears the level and freezes the sim', () => {
    const level = base([]);
    const s = createSimState(level, 1);
    expect(until(s, level, Input.Right, SimEvent.Cleared)).toBe(true);
    const x = s.player.x;
    step(s, Input.Left, level);
    expect(s.cleared).toBe(true);
    expect(s.player.x).toBe(x);
  });
});

describe('collapse', () => {
  it('drops its solid shortly after the player stands on it', () => {
    const level = base([{ type: 'collapse', target: 'drop', delayFrames: 4 }]);
    const s = createSimState(level, 1);
    expect(until(s, level, Input.Right, SimEvent.TrapFired)).toBe(true);
    expect(s.gone[1]).toBe(1);
  });

  it('is scoped to its attempt range: gone on attempt 1, solid on attempt 2', () => {
    const level = base([{ type: 'collapse', target: 'drop', delayFrames: 0, when: { to: 1 } }]);
    const s = createSimState(level, 1);
    // stop on the drop tile so it falls away under the player
    for (let i = 0; i < 400 && s.deaths === 0; i++) {
      step(s, s.player.x < toFixed(180) ? Input.Right : Input.None, level);
    }
    expect(s.deaths).toBe(1);
    expect(s.lastDeath.cause).toBe(DeathCause.Fall);
    expect(s.attempt).toBe(2);
    expect(s.gone).toEqual([0, 0, 0]);
    expect(until(s, level, Input.Right, SimEvent.Cleared)).toBe(true);
  });
});

describe('spike', () => {
  const spikeX = 300;
  const level = base([{ type: 'spike', x: spikeX, y: 184, w: 32, h: 16 }]);

  it('kills on contact', () => {
    const s = createSimState(level, 1);
    expect(until(s, level, Input.Right, SimEvent.Died)).toBe(true);
    expect(s.lastDeath.cause).toBe(DeathCause.Spike);
  });

  it('has a forgiving hitbox: grazing the visual edge is not a death', () => {
    const s = createSimState(level, 1);
    s.player.x = toFixed(spikeX) - PLAYER_W + HAZARD_INSET - 1; // overlaps the visual only
    s.player.y = toFixed(168);
    expect(step(s, Input.None, level) & SimEvent.Died).toBe(0);
  });
});

describe('saw', () => {
  it('stays put until the player passes triggerX, then falls and kills', () => {
    const level = base([
      { type: 'saw', x: 300, y: 0, w: 32, h: 32, triggerX: 260, fallTo: 168, speed: 16 },
    ]);
    const s = createSimState(level, 1);
    for (let i = 0; i < 20; i++) step(s, Input.None, level);
    expect(s.traps[0]!.fired).toBe(0);
    expect(until(s, level, Input.Right, SimEvent.TrapFired)).toBe(true);
    expect(until(s, level, Input.Right, SimEvent.Died)).toBe(true);
    expect(s.lastDeath.cause).toBe(DeathCause.Saw);
  });
});

describe('goalShift', () => {
  it('moves the goal exactly once when the player gets close', () => {
    const level = base([{ type: 'goalShift', dx: -64, triggerDistance: 80 }]);
    const s = createSimState(level, 1);
    expect(until(s, level, Input.Right, SimEvent.TrapFired)).toBe(true);
    expect(goalRect(s, level)!.x).toBe(toFixed(440 - 64));
    expect(until(s, level, Input.Right, SimEvent.TrapFired, 200)).toBe(false);
  });

  it('resets on the next attempt', () => {
    // floor ends at 400, so after the goal jumps away the player runs off the edge
    const level = base([{ type: 'goalShift', dx: 30, triggerDistance: 80 }], {
      solids: [{ id: 'a', x: 0, y: 200, w: 400, h: 40 }],
    });
    const s = createSimState(level, 1);
    expect(until(s, level, Input.Right, SimEvent.TrapFired)).toBe(true);
    expect(s.goalShift).toBe(toFixed(30));
    expect(until(s, level, Input.Right, SimEvent.Died)).toBe(true);
    expect(s.attempt).toBe(2);
    expect(s.goalShift).toBe(0);
  });
});
