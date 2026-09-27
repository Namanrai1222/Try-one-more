import { describe, expect, it } from 'vitest';
import {
  REAL_ERROR_KEY,
  WALLET_KEY,
  createDeviceContext,
  recordRealError,
  saveKey,
} from '../src/index.ts';
import type { StorageLike } from '../src/index.ts';

const memory = (
  data: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } => ({
  data,
  getItem: (k) => data[k] ?? null,
  setItem: (k, v) => {
    data[k] = v;
  },
});

const ctx = (storage: StorageLike | null) =>
  createDeviceContext({ titleId: 'rage', storage, emit: () => {} });

describe('device platform context', () => {
  it('round-trips a title save slot under a title-scoped key', () => {
    const storage = memory();
    ctx(storage).saveProgress({ unlocked: 3 });
    expect(storage.data[saveKey('rage')]).toBe('{"unlocked":3}');
    expect(ctx(storage).loadProgress()).toEqual({ unlocked: 3 });
  });

  it('treats a corrupt or blocked save as empty instead of crashing', () => {
    expect(ctx(memory({ [saveKey('rage')]: '{broken' })).loadProgress()).toBeNull();
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(ctx(blocked).loadProgress()).toBeNull();
    expect(() => ctx(blocked).saveProgress({})).not.toThrow();
    expect(ctx(null).loadProgress()).toBeNull();
  });

  it('shares one wallet across titles, earn-only, with sane amounts', () => {
    const storage = memory();
    const events: Array<[string, unknown]> = [];
    const titled = (titleId: string) =>
      createDeviceContext({ titleId, storage, emit: (n, p) => events.push([n, p]) });
    titled('rage').wallet.earn(10, 10, 'first_clear');
    expect(titled('push').wallet.earn(5, 2.9, 'round_win')).toEqual({ coins: 15, xp: 12 });
    expect(storage.data[WALLET_KEY]).toBe('{"coins":15,"xp":12}');
    expect(events.at(-1)).toEqual([
      'wallet_earn',
      { title: 'push', reason: 'round_win', coins: 5, xp: 2 },
    ]);
    // Nothing can be taken away, and no single event is worth more than 1000.
    expect(titled('rage').wallet.earn(-50, Number.NaN, 'bug')).toEqual({ coins: 15, xp: 12 });
    expect(titled('rage').wallet.earn(1e9, 0, 'bug')).toEqual({ coins: 1015, xp: 12 });
    // A corrupt or hand-edited balance reads as zero, not as NaN or a negative number.
    expect(ctx(memory({ [WALLET_KEY]: '{"coins":-4,"xp":"9"}' })).wallet.read()).toEqual({
      coins: 0,
      xp: 0,
    });
    expect(ctx(memory({ [WALLET_KEY]: '{broken' })).wallet.read()).toEqual({ coins: 0, xp: 0 });
  });

  it('exposes the last real error time, and only a real one', () => {
    const storage = memory();
    expect(ctx(storage).lastRealErrorAt).toBeNull();
    recordRealError(storage, 1234);
    expect(storage.data[REAL_ERROR_KEY]).toBe('1234');
    expect(ctx(storage).lastRealErrorAt).toBe(1234);
    expect(ctx(memory({ [REAL_ERROR_KEY]: 'nonsense' })).lastRealErrorAt).toBeNull();
  });
});
