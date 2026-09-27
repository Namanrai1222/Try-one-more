import { Input } from '@jom/engine';
import { describe, expect, it } from 'vitest';
import { keyCodeToInput } from '../src/input/keyboard.ts';
import { touchBits, touchKindAt } from '../src/input/touch.ts';

describe('keyboard mapping', () => {
  it.each([
    ['ArrowLeft', Input.Left],
    ['KeyA', Input.Left],
    ['ArrowRight', Input.Right],
    ['KeyD', Input.Right],
    ['ArrowUp', Input.Jump],
    ['KeyW', Input.Jump],
    ['Space', Input.Jump],
    ['ArrowDown', Input.Down],
    ['KeyS', Input.Down],
  ])('%s → %i', (code, bit) => expect(keyCodeToInput(code)).toBe(bit));

  it('ignores every other key', () => {
    for (const code of ['Enter', 'KeyQ', 'ShiftLeft', 'Escape', 'KeyZ']) {
      expect(keyCodeToInput(code)).toBe(Input.None);
    }
  });
});

describe('touch zones', () => {
  const width = 400;

  it('left half starts a move touch, right half a jump touch', () => {
    expect(touchKindAt(10, width)).toBe('move');
    expect(touchKindAt(199, width)).toBe('move');
    expect(touchKindAt(200, width)).toBe('jump');
    expect(touchKindAt(390, width)).toBe('jump');
  });

  it('move touches steer by quarter: outer = left, inner = right', () => {
    expect(touchBits('move', 50, width)).toBe(Input.Left);
    expect(touchBits('move', 150, width)).toBe(Input.Right);
  });

  it('a move touch that slides past the midline never becomes a jump', () => {
    expect(touchBits('move', 380, width)).toBe(Input.Right);
  });

  it('a jump touch stays a jump wherever it slides', () => {
    expect(touchBits('jump', 20, width)).toBe(Input.Jump);
  });
});
