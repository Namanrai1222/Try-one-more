import { describe, expect, it } from 'vitest';
import { LevelError, SANDBOX_LEVEL_FILE, compileLevel, parseLevel } from '../src/index.ts';

type Raw = Record<string, unknown>;
const valid = (): Raw => structuredClone(SANDBOX_LEVEL_FILE) as unknown as Raw;

describe('parseLevel', () => {
  it('accepts a valid level and round-trips it', () => {
    expect(parseLevel(valid())).toEqual(SANDBOX_LEVEL_FILE);
  });

  it.each<[string, (l: Raw) => void, string]>([
    ['wrong schema', (l) => (l.schema = 2), 'level.schema'],
    ['missing name', (l) => delete l.name, 'level.name'],
    ['zero-width solid', (l) => ((l.solids as Raw[])[0]!.w = 0), 'level.solids[0].w'],
    ['spawn outside bounds', (l) => (l.spawn = { x: 5000, y: 0 }), 'level.spawn'],
    ['unknown trap type', (l) => (l.traps = [{ type: 'laser' }]), 'level.traps[0].type'],
    [
      'collapse targeting a missing solid',
      (l) => (l.traps = [{ type: 'collapse', target: 'nope' }]),
      'level.traps[0].target',
    ],
    [
      'inverted attempt range',
      (l) => (l.traps = [{ type: 'spike', x: 0, y: 0, w: 8, h: 8, when: { from: 3, to: 2 } }]),
      'level.traps[0].when',
    ],
    ['four hints', (l) => (l.hints = ['a', 'b', 'c', 'd']), 'level.hints'],
    ['an empty hint', (l) => (l.hints = ['']), 'level.hints[0]'],
    ['an essay of a hint', (l) => (l.hints = ['x'.repeat(141)]), 'level.hints[0]'],
    ['a hint that is not text', (l) => (l.hints = [42]), 'level.hints[0]'],
  ])('rejects %s with a path to the problem', (_label, mutate, path) => {
    const level = valid();
    mutate(level);
    expect(() => parseLevel(level)).toThrow(LevelError);
    expect(() => parseLevel(level)).toThrow(path);
  });

  it('keeps hints as presentation only: they never reach the compiled level', () => {
    const level = { ...valid(), hints: ['Look up.', 'Really, look up.'] };
    expect(parseLevel(level).hints).toEqual(['Look up.', 'Really, look up.']);
    expect(compileLevel(parseLevel(level))).toEqual(compileLevel(parseLevel(valid())));
  });

  it('rejects non-objects outright', () => {
    expect(() => parseLevel(null)).toThrow(LevelError);
    expect(() => parseLevel('level')).toThrow(LevelError);
  });
});
