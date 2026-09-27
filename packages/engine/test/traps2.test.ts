import { describe, expect, it } from 'vitest';
import {
  DeathCause,
  Input,
  PLAYER_H,
  SimEvent,
  compileLevel,
  createSimState,
  inScope,
  step,
  toFixed,
} from '../src/index.ts';
import type { LevelFile, SimLevel, SimState, TrapFile } from '../src/index.ts';

const level = (traps: TrapFile[], extra: Partial<LevelFile> = {}): SimLevel =>
  compileLevel({
    schema: 1,
    id: 'traps2',
    chapter: 0,
    index: 0,
    name: 'traps2',
    bounds: { w: 480, h: 240 },
    spawn: { x: 16, y: 160 },
    goal: { x: 440, y: 168, w: 24, h: 32 },
    solids: [{ x: 0, y: 200, w: 480, h: 40 }],
    traps,
    ...extra,
  });

function run(s: SimState, l: SimLevel, mask: (s: SimState) => number, max = 600): number {
  let events = 0;
  for (let i = 0; i < max && !(events & (SimEvent.Died | SimEvent.Cleared)); i++) {
    events |= step(s, mask(s), l);
  }
  return events;
}

describe('attempt scoping', () => {
  it('supports odd/even attempts', () => {
    const odd = { from: 1, to: 99, parity: 1 };
    const even = { from: 1, to: 99, parity: 2 };
    expect([1, 2, 3, 4].map((a) => inScope(odd, a))).toEqual([true, false, true, false]);
    expect([1, 2, 3, 4].map((a) => inScope(even, a))).toEqual([false, true, false, true]);
  });
});

describe('erupting spikes', () => {
  it('time: harmless until their frame, then lethal to whoever is still standing there', () => {
    const l = level([
      { type: 'spike', x: 0, y: 176, w: 64, h: 24, erupt: { on: 'time', frame: 30 } },
    ]);
    const idle = createSimState(l, 1);
    expect(run(idle, l, () => Input.None) & SimEvent.Died).toBeTruthy();
    expect(idle.lastDeath.cause).toBe(DeathCause.Spike);
    const mover = createSimState(l, 1);
    expect(run(mover, l, () => Input.Right) & SimEvent.Cleared).toBeTruthy();
  });

  it('jump: walking across is safe, jumping over them is not', () => {
    const l = level([
      { type: 'spike', x: 200, y: 110, w: 48, h: 90, erupt: { on: 'jump', frames: 20 } },
    ]);
    const walker = createSimState(l, 1);
    expect(run(walker, l, () => Input.Right) & SimEvent.Cleared).toBeTruthy();
    const jumper = createSimState(l, 1);
    const events = run(jumper, l, (s) =>
      s.player.x > toFixed(180) && s.player.x < toFixed(200)
        ? Input.Right | Input.Jump
        : Input.Right,
    );
    expect(events & SimEvent.Died).toBeTruthy();
    expect(jumper.lastDeath.cause).toBe(DeathCause.Spike);
  });
});

describe('coin', () => {
  it('kills whoever picks it up', () => {
    const l = level([{ type: 'coin', x: 300, y: 170, w: 24, h: 24 }]);
    const s = createSimState(l, 1);
    expect(run(s, l, () => Input.Right) & SimEvent.Died).toBeTruthy();
    expect(s.lastDeath.cause).toBe(DeathCause.Greed);
  });
});

describe('crusher', () => {
  it('descends and crushes a player who waits', () => {
    const l = level([
      { type: 'crusher', x: 0, y: -100, w: 480, h: 120, triggerX: 0, fallTo: 80, speed: 2 },
    ]);
    const s = createSimState(l, 1);
    expect(run(s, l, () => Input.None) & SimEvent.Died).toBeTruthy();
    expect(s.lastDeath.cause).toBe(DeathCause.Crush);
  });
});

describe('alternating doors', () => {
  const l = level([{ type: 'fakeGoal', x: 300, y: 168, w: 24, h: 32, when: { parity: 'odd' } }], {
    goal: undefined,
    goals: [
      { x: 300, y: 168, w: 24, h: 32, when: { parity: 'even' } },
      { x: 440, y: 168, w: 24, h: 32, look: 'alt' },
    ],
  });

  it('the near door kills on odd attempts and is the exit on even ones', () => {
    const s = createSimState(l, 1);
    expect(run(s, l, () => Input.Right) & SimEvent.Died).toBeTruthy();
    expect(s.lastDeath.cause).toBe(DeathCause.FakeDoor);
    expect(s.attempt).toBe(2);
    expect(run(s, l, () => Input.Right) & SimEvent.Cleared).toBeTruthy();
    expect(s.player.x).toBeLessThan(toFixed(330));
  });
});

describe('gravity flip', () => {
  const l = level([{ type: 'gravityFlip', triggerX: 250 }], {
    goal: { x: 440, y: 24, w: 24, h: 32 },
    solids: [
      { x: 0, y: 0, w: 480, h: 24 },
      { x: 0, y: 200, w: 300, h: 40 },
    ],
  });

  it('sends the player up to land on the ceiling, where the door is', () => {
    const s = createSimState(l, 1);
    let flippedAndLanded = false;
    const events = run(s, l, (st) => {
      if (st.gravity === -1 && st.player.onGround) flippedAndLanded = true;
      return Input.Right;
    });
    expect(flippedAndLanded).toBe(true);
    expect(events & SimEvent.Cleared).toBeTruthy();
  });

  it('jumps go downward while flipped, and the ceiling is the floor', () => {
    const s = createSimState(l, 1);
    run(s, l, (st) => (st.gravity === -1 && st.player.onGround ? Input.None : Input.Right), 200);
    expect(s.player.y).toBe(toFixed(24));
    step(s, Input.Jump, l);
    expect(s.player.vy).toBeGreaterThan(0);
    expect(s.player.y + PLAYER_H).toBeGreaterThan(toFixed(24));
  });

  it('resets to normal gravity on the next attempt', () => {
    const pit = level([{ type: 'gravityFlip', triggerX: 100 }], {
      solids: [{ x: 0, y: 200, w: 480, h: 40 }],
    });
    const s = createSimState(pit, 1);
    expect(run(s, pit, () => Input.Right) & SimEvent.Died).toBeTruthy(); // falls up and out
    expect(s.lastDeath.cause).toBe(DeathCause.Fall);
    expect(s.gravity).toBe(1);
  });
});
