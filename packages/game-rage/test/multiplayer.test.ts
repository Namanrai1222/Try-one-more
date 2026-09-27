import { InputReplayer, createSimState, step } from '@jom/engine';
import type { InputLog } from '@jom/engine';
import { describe, expect, it } from 'vitest';
import { RACE_LEVELS, SABOTAGE_LEVELS } from '../levels/index.ts';
import { allGates } from '../scripts/solver.ts';
import solutions from '../levels/solutions.json' with { type: 'json' };

const recorded = solutions as unknown as Record<string, { frames: number; inputLog: InputLog }>;

/**
 * SECURITY.md §5 solvability: a race leader or a full sabotage can never make a level
 * unwinnable. The recorded run clears with every gate on; gated traps only add hazards, so the
 * same run clears with any subset of them — checked here at the two extremes.
 */
describe('multiplayer levels', () => {
  it.each([...RACE_LEVELS, ...SABOTAGE_LEVELS].map((l) => [l.file.id, l] as const))(
    '%s clears with every gate on and with none',
    (id, level) => {
      const run = recorded[id]!;
      expect(allGates(level.sim)).toBeGreaterThan(0);
      for (const gates of [allGates(level.sim), 0]) {
        const s = createSimState(level.sim, 1);
        s.gates = gates;
        const input = new InputReplayer(run.inputLog);
        for (let f = 0; f < run.frames; f++) step(s, input.maskAt(f), level.sim);
        expect([gates, s.cleared, s.deaths]).toEqual([gates, true, 0]);
      }
    },
  );

  it('sabotage slots are numbered 1..n with no gaps, each slot one trap', () => {
    for (const { sim } of SABOTAGE_LEVELS) {
      const bits = sim.traps.map((t) => t.gate).filter((g) => g !== undefined);
      const slots = bits.map((b) => Math.log2(b!)).sort((a, b) => a - b);
      expect(slots).toEqual(slots.map((_, i) => i + 1));
    }
  });
});
