import { describe, expect, it } from 'vitest';
import { Input, InputRecorder, InputReplayer, validateInputLog } from '../src/index.ts';

describe('InputRecorder', () => {
  it('records only changes, as [frame, mask] pairs', () => {
    const r = new InputRecorder();
    const masks = [0, 0, 2, 2, 2, 6, 6, 2, 0, 0];
    masks.forEach((m, frame) => r.record(frame, m));
    expect(r.log).toEqual([
      [2, 2],
      [5, 6],
      [7, 2],
      [8, 0],
    ]);
  });

  it('reset clears the log and the last mask', () => {
    const r = new InputRecorder();
    r.record(0, Input.Right);
    r.reset();
    r.record(0, Input.Right);
    expect(r.log).toEqual([[0, Input.Right]]);
  });
});

describe('InputReplayer', () => {
  it('reproduces the per-frame masks the recorder saw', () => {
    const masks = [0, 1, 1, 5, 4, 4, 0, 2, 2, 2];
    const r = new InputRecorder();
    masks.forEach((m, frame) => r.record(frame, m));
    const p = new InputReplayer(r.log);
    expect(masks.map((_, frame) => p.maskAt(frame))).toEqual(masks);
  });

  it('is forward-only', () => {
    const p = new InputReplayer([[3, 1]]);
    p.maskAt(5);
    expect(() => p.maskAt(4)).toThrow(RangeError);
  });
});

describe('validateInputLog', () => {
  it('accepts a well-formed log', () => {
    expect(
      validateInputLog(
        [
          [0, 2],
          [10, 6],
          [20, 0],
        ],
        30,
      ),
    ).toEqual({ ok: true });
  });

  it.each([
    ['not an array', {}, 10],
    ['a non-pair entry', [[1, 2, 3]], 10],
    ['a negative frame', [[-1, 2]], 10],
    ['a fractional frame', [[1.5, 2]], 10],
    ['an unknown mask bit', [[1, 16]], 10],
    [
      'out-of-order frames',
      [
        [5, 1],
        [5, 2],
      ],
      10,
    ],
    ['a frame past the run end', [[10, 1]], 10],
  ])('rejects %s', (_label, log, frames) => {
    expect(validateInputLog(log, frames).ok).toBe(false);
  });
});
