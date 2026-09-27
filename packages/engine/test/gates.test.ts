import { describe, expect, it } from 'vitest';
import {
  Input,
  LEADER_GATE,
  LevelError,
  SimEvent,
  compileLevel,
  createSimState,
  hashState,
  parseLevel,
  step,
} from '../src/index.ts';
import type { SimLevel } from '../src/index.ts';

const base = {
  schema: 1,
  id: 'gates',
  chapter: 0,
  index: 0,
  name: 'Gates',
  bounds: { w: 960, h: 540 },
  spawn: { x: 64, y: 416 },
  goal: { x: 900, y: 384, w: 40, h: 64 },
  solids: [{ id: 'floor', x: 0, y: 448, w: 960, h: 92 }],
};

const level = (gate: unknown): SimLevel =>
  compileLevel(
    parseLevel({ ...base, traps: [{ type: 'spike', x: 300, y: 424, w: 48, h: 24, gate }] }),
  );

/** Hold Right until death or clear; true if the spikes killed. */
function runsIntoSpikes(l: SimLevel, gates: number): boolean {
  const s = createSimState(l, 1);
  s.gates = gates;
  for (let i = 0; i < 600; i++) {
    const e = step(s, Input.Right, l);
    if (e & SimEvent.Died) return true;
    if (e & SimEvent.Cleared) return false;
  }
  return false;
}

describe('multiplayer gates', () => {
  it('a leader-gated trap only acts while the leader bit is on', () => {
    const l = level('leader');
    expect(l.traps[0]!.gate).toBe(LEADER_GATE);
    expect(runsIntoSpikes(l, 0)).toBe(false);
    expect(runsIntoSpikes(l, LEADER_GATE)).toBe(true);
  });

  it('a sabotage slot k is bit 1 << k', () => {
    const l = level(3);
    expect(l.traps[0]!.gate).toBe(1 << 3);
    expect(runsIntoSpikes(l, 1 << 2)).toBe(false);
    expect(runsIntoSpikes(l, 1 << 3)).toBe(true);
  });

  it('only accepts leader or slots 1–30', () => {
    for (const bad of [0, 31, 'boss', 1.5]) expect(() => level(bad)).toThrow(LevelError);
  });

  it('leaves ungated levels and solo hashes exactly as before', () => {
    const plain = compileLevel(
      parseLevel({ ...base, traps: [{ type: 'spike', x: 300, y: 424, w: 48, h: 24 }] }),
    );
    expect('gate' in plain.traps[0]!).toBe(false);
    const s = createSimState(plain, 1);
    const before = hashState(s);
    s.gates = 0;
    expect(hashState(s)).toBe(before);
    s.gates = LEADER_GATE;
    expect(hashState(s)).not.toBe(before);
  });
});
