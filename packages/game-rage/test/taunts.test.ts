import { DeathCause } from '@jom/engine';
import { describe, expect, it } from 'vitest';
import { TAUNTS, pickTaunt, tagsFor } from '../src/taunts.ts';

const ctx = { deaths: 3, cause: DeathCause.Spike, distanceToGoalPx: 400 };

describe('taunt engine', () => {
  it('ships at least 25 lines (PRD.md §6 Phase 1)', () => {
    expect(TAUNTS.length).toBeGreaterThanOrEqual(25);
  });

  it('never repeats the same line twice in a row', () => {
    let previous: string | null = null;
    for (let i = 0; i < 500; i++) {
      const next = pickTaunt(ctx, previous);
      expect(next).not.toBe(previous);
      previous = next;
    }
  });

  it('reads the situation: cause, closeness to the door, early and repeated deaths', () => {
    expect([...tagsFor({ deaths: 1, cause: DeathCause.Fall, distanceToGoalPx: 50 })]).toEqual(
      expect.arrayContaining(['early', 'close', 'fall']),
    );
    const late = tagsFor({ deaths: 9, cause: DeathCause.Saw, distanceToGoalPx: 900 });
    expect(late.has('repeated')).toBe(true);
    expect(late.has('early')).toBe(false);
  });

  it('only ever picks a line whose tags match the context', () => {
    const allowed = new Set(
      TAUNTS.filter((t) => t.tags.some((tag) => tag === 'any' || tag === 'spike')).map(
        (t) => t.text,
      ),
    );
    for (let i = 0; i < 200; i++) expect(allowed.has(pickTaunt(ctx, null))).toBe(true);
  });

  it('fills in the death count', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      seen.add(pickTaunt({ deaths: 7, cause: DeathCause.Fall, distanceToGoalPx: 900 }, null));
    }
    expect([...seen].some((t) => t.includes('{n}'))).toBe(false);
    expect(seen.has('7 times. Impressive commitment.')).toBe(true);
  });

  it('includes level-specific overrides for early deaths', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      seen.add(
        pickTaunt({ deaths: 1, cause: DeathCause.Fall, distanceToGoalPx: 900 }, null, [
          'Custom line.',
        ]),
      );
    }
    expect(seen.has('Custom line.')).toBe(true);
  });
});
