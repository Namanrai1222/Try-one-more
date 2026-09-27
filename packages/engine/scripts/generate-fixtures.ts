/**
 * Regenerates the determinism fixtures. Run ONLY when you intentionally change physics,
 * trap behaviour, or fixture level geometry:  pnpm --filter @jom/engine fixtures:update
 *
 * Each run is driven "live" (inputs recorded by InputRecorder while stepping), and the
 * test later replays the recorded log through InputReplayer. So the fixtures check both
 * frame-exact determinism and that record → replay is lossless.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  InputRecorder,
  createRng,
  createSimState,
  deriveSeed,
  fnv1a,
  hashLevel,
  hashPhysics,
  hashState,
  snapshot,
  step,
} from '../src/index.ts';
import { FIXTURE_LEVELS, FIXTURE_PATH, FIXTURE_RUNS } from './fixture-format.ts';
import type { FixtureFile, FixtureRun } from './fixture-format.ts';

// Bias toward holding right and jumping so runs actually traverse the level.
const MASK_POOL = [0, 1, 2, 2, 2, 4, 6, 6, 6, 5, 1, 2, 8, 10, 6, 0];
const levels = Object.values(FIXTURE_LEVELS);

const runs: FixtureRun[] = [];
for (let id = 0; id < FIXTURE_RUNS; id++) {
  const level = levels[id % levels.length]!;
  const rng = createRng(fnv1a(`fixture:${id}`));
  const frames = 300 + rng.nextInt(901); // 5–20 seconds
  const seed = deriveSeed(level.id, id);
  const state = createSimState(level, seed);
  const recorder = new InputRecorder();

  let mask = 0;
  let holdFor = 0;
  for (let f = 0; f < frames; f++) {
    if (holdFor-- <= 0) {
      mask = MASK_POOL[rng.nextInt(MASK_POOL.length)]!;
      holdFor = 3 + rng.nextInt(38);
    }
    recorder.record(state.frame, mask);
    step(state, mask, level);
  }

  runs.push({
    id,
    levelId: level.id,
    seed,
    frames,
    inputLog: recorder.log.map(([f, m]) => [f, m] as const),
    expected: { ...snapshot(state), hash: hashState(state) },
  });
}

const file: FixtureFile = {
  version: 2,
  levelHashes: Object.fromEntries(levels.map((l) => [l.id, hashLevel(l)])),
  physicsHash: hashPhysics(),
  runs,
};

mkdirSync(new URL('.', FIXTURE_PATH), { recursive: true });
writeFileSync(FIXTURE_PATH, JSON.stringify(file) + '\n');
const deaths = runs.reduce((n, r) => n + r.expected.deaths, 0);
const clears = runs.filter((r) => r.expected.cleared).length;
console.log(
  `wrote ${runs.length} runs (${deaths} deaths, ${clears} clears) → ${fileURLToPath(FIXTURE_PATH)}`,
);
