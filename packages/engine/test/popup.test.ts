import { describe, expect, it } from 'vitest';
import {
  DeathCause,
  Input,
  SimEvent,
  compileLevel,
  createSimState,
  parseLevel,
  spikeUp,
  step,
} from '../src/index.ts';
import type { TrapFile } from '../src/index.ts';

const level = (traps: TrapFile[]) =>
  compileLevel(
    parseLevel({
      schema: 1,
      id: 'popup',
      chapter: 0,
      index: 0,
      name: 'Popup',
      bounds: { w: 960, h: 540 },
      spawn: { x: 64, y: 416 },
      goal: { x: 900, y: 384, w: 40, h: 64 },
      solids: [{ id: 'floor', x: 0, y: 448, w: 960, h: 92 }],
      traps,
    }),
  );

const popup: TrapFile = {
  type: 'spike',
  x: 500,
  y: 424,
  w: 40,
  h: 24,
  erupt: { on: 'near', distance: 90 },
};

describe('pop-up spikes (erupt on near)', () => {
  it('stay hidden and harmless until the player is close, then pop and stay out', () => {
    const l = level([popup]);
    const s = createSimState(l, 1);
    let poppedAtX = -1;
    for (let i = 0; i < 300 && s.deaths === 0; i++) {
      const events = step(s, Input.Right, l);
      if (events & SimEvent.TrapFired && poppedAtX < 0) poppedAtX = s.player.x / 1000;
    }
    // Centre within 90px of the spike's edge (x 500): the player's left edge is near 398.
    expect(poppedAtX).toBeGreaterThanOrEqual(398);
    expect(poppedAtX).toBeLessThan(404); // one 4.5px step of slack
    expect(s.deaths).toBe(1);
    expect(s.lastDeath.cause).toBe(DeathCause.Spike);
    // A new attempt re-hides it.
    expect(spikeUp(s, l, 0)).toBe(false);
  });

  it('can be jumped by a player who knows it is there', () => {
    const l = level([popup]);
    const s = createSimState(l, 1);
    for (let i = 0; i < 400 && s.deaths === 0 && !s.cleared; i++) {
      const x = s.player.x / 1000;
      // A full jump (held until past it): releasing early halves the jump.
      step(s, x > 410 && x < 560 ? Input.Right | Input.Jump : Input.Right, l);
    }
    expect(s.deaths).toBe(0);
    expect(s.cleared).toBe(true);
  });

  it('is rejected without a distance', () => {
    expect(() => level([{ ...popup, erupt: { on: 'near' } } as unknown as TrapFile])).toThrow(
      'erupt.distance',
    );
  });
});

describe('starting on a later attempt', () => {
  it('arms the traps and doors scoped to that attempt', () => {
    const l = level([{ type: 'spike', x: 300, y: 424, w: 40, h: 24, when: { from: 3 } }]);
    expect(createSimState(l, 1).traps[0]!.active).toBe(0);
    const third = createSimState(l, 1, 3);
    expect(third.attempt).toBe(3);
    expect(third.traps[0]!.active).toBe(1);
  });
});
