/**
 * Seeded randomness (TECH_STACK.md §5). `Math.random()` is banned in simulation code;
 * the sim carries its PRNG state as a plain uint32 inside SimState so the whole state
 * stays serialisable and hashable.
 */

/** 32-bit FNV-1a over UTF-16 code units. Stable across engines. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seed for one attempt of one level: derived from `levelId + attemptNumber`. */
export function deriveSeed(levelId: string, attempt: number): number {
  return fnv1a(`${levelId}:${attempt}`);
}

/** One mulberry32 step. Pure: takes a uint32 state, returns the next state and a uint32 value. */
export function mulberry32(state: number): { state: number; value: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: next >>> 0, value: (t ^ (t >>> 14)) >>> 0 };
}

/** Stateful convenience wrapper for code outside the sim (fixture generation, tests). */
export function createRng(seed: number) {
  let state = seed >>> 0;
  return {
    nextU32(): number {
      const r = mulberry32(state);
      state = r.state;
      return r.value;
    },
    /** Integer in [0, maxExclusive). */
    nextInt(maxExclusive: number): number {
      return this.nextU32() % maxExclusive;
    },
  };
}
