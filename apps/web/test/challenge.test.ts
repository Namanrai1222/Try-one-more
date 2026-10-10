import { describe, expect, it } from 'vitest';
import { challengeLine, parseChallenge } from '../app/c/[code]/challenge';
import { challengePath } from '../app/c/path';

const code = (path: string) => path.replace('/c/', '');

describe('challenge links', () => {
  it('round-trips what the play host shares', () => {
    expect(challengePath(7, 23)).toBe('/c/rage-7-23');
    expect(parseChallenge(code(challengePath(7, 23)))).toEqual({
      level: 7,
      deaths: 23,
      name: 'Two Doors',
    });
    expect(parseChallenge(code(challengePath(1, 0)))?.deaths).toBe(0);
  });

  it('caps deaths so the set of OG images stays bounded', () => {
    expect(challengePath(2, 123456)).toBe('/c/rage-2-9999');
    expect(parseChallenge('rage-2-10000')).toBeNull();
  });

  it('rejects anything else', () => {
    for (const bad of [
      '',
      'rage-0-3',
      'rage-41-3', // past the last level
      'rage-7-023',
      'rage-7--1',
      'rage-7-3-1',
      'other-7-3',
      'rage-7-3<script>',
      'RAGE-7-3',
      'rage-7-1e3',
    ]) {
      expect(parseChallenge(bad), bad).toBeNull();
    }
  });

  it('says it plainly', () => {
    expect(challengeLine({ level: 3, deaths: 1, name: 'x' })).toBe(
      'A friend died once on level 3.',
    );
    expect(challengeLine({ level: 3, deaths: 0, name: 'x' })).toBe(
      'A friend cleared level 3 first try.',
    );
  });
});
