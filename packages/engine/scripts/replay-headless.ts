/**
 * Replays every determinism fixture in plain Node — no bundler, no DOM, no test runner.
 * Proves the engine can run headless server-side, which Phase 4 replay verification
 * depends on (SECURITY.md §4.2, §11 Phase 1).
 *
 *   pnpm --filter @jom/engine replay:headless
 */
import { readFileSync } from 'node:fs';
import { replay, validateInputLog } from '../src/index.ts';
import { FIXTURE_LEVELS, FIXTURE_PATH } from './fixture-format.ts';
import type { FixtureFile } from './fixture-format.ts';

const fixtures = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureFile;
let failures = 0;
const started = performance.now();

for (const run of fixtures.runs) {
  const valid = validateInputLog(run.inputLog, run.frames);
  if (!valid.ok) {
    console.error(`run ${run.id}: invalid input log — ${valid.reason}`);
    failures++;
    continue;
  }
  const { hash } = replay(FIXTURE_LEVELS[run.levelId]!, run.seed, run.inputLog, run.frames);
  if (hash !== run.expected.hash) {
    console.error(`run ${run.id}: expected ${run.expected.hash}, got ${hash}`);
    failures++;
  }
}

const ms = (performance.now() - started).toFixed(1);
console.log(
  `${fixtures.runs.length - failures}/${fixtures.runs.length} runs frame-exact (${ms}ms)`,
);
process.exitCode = failures === 0 ? 0 : 1;
