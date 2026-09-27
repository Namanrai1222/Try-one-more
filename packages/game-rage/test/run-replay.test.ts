import {
  Input,
  InputRecorder,
  InputReplayer,
  SimEvent,
  createSimState,
  deriveSeed,
  hashState,
  step,
} from '@jom/engine';
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../levels/index.ts';
import { rageScore } from '../src/rage.ts';

describe('clip replay', () => {
  // clip.ts rebuilds the run from what game.ts records: record(state.frame, mask), then step.
  it('replaying the recorded run reproduces the death on the same frame', () => {
    const level = LEVELS[0]!.sim;
    const live = createSimState(level, deriveSeed(level.id, 1));
    const recorder = new InputRecorder();
    let deathEnd = 0;
    for (let i = 0; i < 1200 && !deathEnd; i++) {
      const mask = i % 90 < 40 ? Input.Right : i % 90 < 45 ? Input.Right | Input.Jump : 0;
      recorder.record(live.frame, mask);
      if (step(live, mask, level) & SimEvent.Died) deathEnd = live.frame;
    }
    expect(deathEnd).toBeGreaterThan(0);

    const again = createSimState(level, deriveSeed(level.id, 1));
    const input = new InputReplayer(recorder.log);
    while (again.frame < deathEnd - 1) step(again, input.maskAt(again.frame), level);
    expect(step(again, input.maskAt(again.frame), level) & SimEvent.Died).toBeTruthy();
    expect(hashState(again)).toBe(hashState(live));
  });
});

describe('rageScore', () => {
  it('maps press rate to a 0–99 score with a printed line', () => {
    expect(rageScore(0, 600)).toEqual({ score: 0, line: 'Calm. Suspiciously calm.' });
    expect(rageScore(30, 600).score).toBe(30); // 3 presses a second
    expect(rageScore(30, 600).line).toBe('Mildly annoyed.');
    expect(rageScore(1000, 600)).toEqual({ score: 99, line: 'Go outside. The level will wait.' });
    expect(rageScore(5, 0).score).toBe(60); // very short runs count as one second
  });
});
