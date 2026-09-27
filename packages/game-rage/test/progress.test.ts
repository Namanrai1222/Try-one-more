import { describe, expect, it } from 'vitest';
import { readProgress, unlockedIndex } from '../src/progress.ts';

const fresh = {
  deaths: {},
  unlocked: 0,
  muted: false,
  sessions: 0,
  daily: { last: null, streak: 0, best: 0 },
  best: {},
};

describe('readProgress (untrusted save data)', () => {
  it('starts fresh from nothing', () => {
    expect(readProgress(null)).toEqual(fresh);
  });

  it('keeps valid fields and drops garbage', () => {
    expect(
      readProgress({
        deaths: { a: 3, b: -1, c: 'x', d: 2.5 },
        unlocked: 4,
        muted: 'yes',
        sessions: 7,
        extra: true,
      }),
    ).toEqual({ ...fresh, deaths: { a: 3 }, unlocked: 4, sessions: 7 });
  });

  it('never trusts a negative or fractional unlock', () => {
    expect(readProgress({ unlocked: -2 }).unlocked).toBe(0);
    expect(readProgress({ unlocked: 1.5 }).unlocked).toBe(0);
  });

  it('validates the daily streak and stored best runs', () => {
    const p = readProgress({
      daily: { last: '2026-10-01', streak: 3, best: 5 },
      best: {
        ok: { frames: 200, deaths: 1, log: [[0, 2]] },
        pastEnd: { frames: 10, deaths: 0, log: [[50, 2]] },
        badMask: { frames: 200, deaths: 0, log: [[0, 99]] },
        notALog: { frames: 200, deaths: 0, log: 'x' },
      },
    });
    expect(p.daily).toEqual({ last: '2026-10-01', streak: 3, best: 5 });
    expect(Object.keys(p.best)).toEqual(['ok']);
    expect(readProgress({ daily: { last: 'yesterday', streak: -1 } }).daily).toEqual(fresh.daily);
  });

  it('opens levels added after the last one a player cleared', () => {
    const run = { frames: 200, deaths: 0, log: [[0, 2]] };
    const ids = ['a', 'b', 'c', 'd'];
    // Saved when 'b' was the last level, and 'b' was cleared: 'c' opens, 'd' does not.
    expect(unlockedIndex(readProgress({ unlocked: 1, best: { a: run, b: run } }), ids)).toBe(2);
    // Not cleared yet: nothing new opens.
    expect(unlockedIndex(readProgress({ unlocked: 1, best: { a: run } }), ids)).toBe(1);
  });
});
