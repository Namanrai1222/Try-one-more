import { compileLevel, parseLevel, replay } from '@jom/engine';
import { describe, expect, it } from 'vitest';
import { solve } from '../scripts/solver.ts';
import { dailyLevel } from '../src/daily.ts';
import { liveStreak, recordDailyClear, utcDay } from '../src/progress.ts';

describe('Daily Trap', () => {
  it('is the same level for everyone on the same day, and a new one tomorrow', () => {
    expect(dailyLevel('2026-10-01')).toEqual(dailyLevel('2026-10-01'));
    expect(dailyLevel('2026-10-02')).not.toEqual(dailyLevel('2026-10-01'));
    expect(() => parseLevel(dailyLevel('2026-10-01'))).not.toThrow();
  });

  // The full 60-day sweep is `pnpm --filter @jom/game-rage daily:check`; this samples it.
  it.each(['2026-10-01', '2027-02-28', '2027-12-31'])(
    '%s is clearable without dying',
    (day) => {
      const level = compileLevel(parseLevel(dailyLevel(day)));
      const run = solve(level);
      expect(run).not.toBeNull();
      const { state } = replay(level, 1, run!.inputLog, run!.frames);
      expect(state.cleared && state.deaths === 0).toBe(true);
    },
    30_000,
  );
});

describe('daily streak', () => {
  const none = { last: null, streak: 0, best: 0 };

  it('starts, extends day by day, and restarts after a missed day', () => {
    const d1 = recordDailyClear(none, '2026-10-01');
    expect(d1).toEqual({ last: '2026-10-01', streak: 1, best: 1 });
    const d2 = recordDailyClear(d1, '2026-10-02');
    expect(d2).toEqual({ last: '2026-10-02', streak: 2, best: 2 });
    expect(recordDailyClear(d2, '2026-10-02')).toBe(d2); // twice in a day counts once
    expect(recordDailyClear(d2, '2026-10-05')).toEqual({ last: '2026-10-05', streak: 1, best: 2 });
  });

  it('crosses month and year ends in UTC', () => {
    const dec31 = { last: '2026-12-31', streak: 4, best: 4 };
    expect(recordDailyClear(dec31, '2027-01-01').streak).toBe(5);
    expect(utcDay(Date.parse('2027-01-01T23:59:59Z'))).toBe('2027-01-01');
  });

  it('shows a live streak only while it can still be extended', () => {
    const s = { last: '2026-10-01', streak: 3, best: 3 };
    expect(liveStreak(s, '2026-10-01')).toBe(3);
    expect(liveStreak(s, '2026-10-02')).toBe(3);
    expect(liveStreak(s, '2026-10-03')).toBe(0);
  });
});
