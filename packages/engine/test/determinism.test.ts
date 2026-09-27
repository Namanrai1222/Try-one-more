import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  Input,
  InputRecorder,
  SANDBOX_LEVEL,
  createSimState,
  deriveSeed,
  hashLevel,
  hashPhysics,
  hashState,
  replay,
  snapshot,
  step,
} from '../src/index.ts';
import { FIXTURE_LEVELS, FIXTURE_PATH, FIXTURE_RUNS } from '../scripts/fixture-format.ts';
import type { FixtureFile } from '../scripts/fixture-format.ts';

const fixtures = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureFile;
const levelOf = (id: string) => FIXTURE_LEVELS[id]!;

// TECH_STACK.md §5: "If this test ever goes red, stop and fix it before anything else."
describe('determinism harness', () => {
  it('fixtures match the current levels and physics', () => {
    const hint =
      'Physics, traps or fixture levels changed. If intentional, regenerate: pnpm --filter @jom/engine fixtures:update';
    const current = Object.fromEntries(
      Object.values(FIXTURE_LEVELS).map((l) => [l.id, hashLevel(l)]),
    );
    expect(fixtures.levelHashes, hint).toEqual(current);
    expect(fixtures.physicsHash, hint).toBe(hashPhysics());
    expect(fixtures.runs).toHaveLength(FIXTURE_RUNS);
  });

  it.each(fixtures.runs.map((run) => [run.id, run.levelId, run] as const))(
    'recorded run %i (%s) replays frame-exact',
    (_id, levelId, run) => {
      const { state, hash } = replay(levelOf(levelId), run.seed, run.inputLog, run.frames);
      expect({ ...snapshot(state), hash }).toEqual(run.expected);
    },
  );

  it('fixtures exercise deaths, attempt changes and traps, not just walking', () => {
    const trapRuns = fixtures.runs.filter((r) => r.levelId === 'fixture-traps');
    expect(fixtures.runs.reduce((n, r) => n + r.expected.deaths, 0)).toBeGreaterThan(0);
    expect(trapRuns.some((r) => r.expected.attempt >= 3)).toBe(true);
  });

  it('replaying the same run twice in one process gives the same hash', () => {
    const run = fixtures.runs[1]!;
    const a = replay(levelOf(run.levelId), run.seed, run.inputLog, run.frames).hash;
    const b = replay(levelOf(run.levelId), run.seed, run.inputLog, run.frames).hash;
    expect(a).toBe(b);
  });

  it('live play recorded by InputRecorder replays to the identical state', () => {
    const seed = deriveSeed(SANDBOX_LEVEL.id, 7);
    const live = createSimState(SANDBOX_LEVEL, seed);
    const recorder = new InputRecorder();
    const pattern = [Input.Right, Input.Right | Input.Jump, Input.Right, Input.None, Input.Left];
    for (let f = 0; f < 600; f++) {
      const mask = pattern[Math.floor(f / 23) % pattern.length]!;
      recorder.record(live.frame, mask);
      step(live, mask, SANDBOX_LEVEL);
    }
    const replayed = replay(SANDBOX_LEVEL, seed, recorder.log, 600);
    expect(replayed.hash).toBe(hashState(live));
  });

  it('is sensitive: changing one recorded input changes the outcome', () => {
    const run = fixtures.runs[0]!;
    const [first, ...rest] = run.inputLog;
    const altered = [[first![0], first![1] ^ Input.Right] as const, ...rest];
    const { hash } = replay(levelOf(run.levelId), run.seed, altered, run.frames);
    expect(hash).not.toBe(run.expected.hash);
  });
});
