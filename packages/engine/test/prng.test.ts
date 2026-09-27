import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, fnv1a, mulberry32 } from '../src/index.ts';

describe('fnv1a', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });
});

describe('deriveSeed', () => {
  it('is stable and distinguishes level and attempt', () => {
    expect(deriveSeed('ch1-l01', 1)).toBe(deriveSeed('ch1-l01', 1));
    expect(deriveSeed('ch1-l01', 1)).not.toBe(deriveSeed('ch1-l01', 2));
    expect(deriveSeed('ch1-l01', 1)).not.toBe(deriveSeed('ch1-l02', 1));
  });
});

describe('mulberry32', () => {
  it('is reproducible from a seed', () => {
    const a = createRng(123);
    const b = createRng(123);
    const seqA = Array.from({ length: 20 }, () => a.nextU32());
    const seqB = Array.from({ length: 20 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it('produces uint32 values and uint32 state', () => {
    let state = 0;
    for (let i = 0; i < 1000; i++) {
      const r = mulberry32(state);
      expect(Number.isInteger(r.value) && r.value >= 0 && r.value < 2 ** 32).toBe(true);
      expect(Number.isInteger(r.state) && r.state >= 0 && r.state < 2 ** 32).toBe(true);
      state = r.state;
    }
  });

  it('nextInt stays in range', () => {
    const rng = createRng(9);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(7);
      expect(v >= 0 && v < 7).toBe(true);
    }
  });
});
