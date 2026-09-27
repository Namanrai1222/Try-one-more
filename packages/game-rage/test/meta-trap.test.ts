import { parseLevel } from '@jom/engine';
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../levels/index.ts';
import { QUIET_AFTER_REAL_ERROR_MS, metaTrapAllowed } from '../src/meta-trap.ts';

const now = 1_800_000_000_000;

describe('meta-trap safety rules (SECURITY.md §9)', () => {
  it('never runs during a first session', () => {
    expect(metaTrapAllowed({ sessions: 1, lastRealErrorAt: null, now })).toBe(false);
    expect(metaTrapAllowed({ sessions: 2, lastRealErrorAt: null, now })).toBe(true);
  });

  it('stays quiet for 10 minutes after a real error', () => {
    const recent = now - QUIET_AFTER_REAL_ERROR_MS + 1;
    const old = now - QUIET_AFTER_REAL_ERROR_MS - 1;
    expect(metaTrapAllowed({ sessions: 5, lastRealErrorAt: recent, now })).toBe(false);
    expect(metaTrapAllowed({ sessions: 5, lastRealErrorAt: old, now })).toBe(true);
  });

  it('can never last longer than 3 seconds, and only fakes the loading screen', () => {
    const base = { ...LEVELS[7]!.file };
    expect(() => parseLevel({ ...base, metaTrap: { kind: 'fakeLoading', frames: 181 } })).toThrow(
      '3 seconds',
    );
    expect(() => parseLevel({ ...base, metaTrap: { kind: 'fakeLogin', frames: 60 } })).toThrow(
      'level.metaTrap.kind',
    );
  });

  it('is only used by the levels designed for it (PRD.md: 8, 15, 24)', () => {
    expect(LEVELS.filter((l) => l.file.metaTrap).map((l) => l.file.id)).toEqual([
      'ch1-l08-loading',
      'ch3-l24-error',
    ]);
    const fakeClears = LEVELS.filter((l) => l.file.traps?.some((t) => t.type === 'fakeClear'));
    expect(fakeClears.map((l) => l.file.id)).toEqual(['ch2-l15-well-done']);
  });
});
