/**
 * Finds a zero-death clear of each level with the beam-search solver (solver.ts), then writes
 * levels/solutions.json: replayed by levels.test.ts, and shown to stuck players as the level's
 * "Watch how". A level it cannot solve is reported, and fails CI once its recording is missing.
 *
 * Levels can change between attempts (traps scoped with `when`: the ones that appear after you
 * die). Every distinct attempt layout gets its own run, stored as `<id>@<attempt>`, so a trap
 * that only shows up on attempt 2 can never make the level impossible.
 *
 * Because people watch and copy these runs, each is solved a few ways (steady input, and "human
 * twin" robust modes) and the run that best survives human timing error is kept.
 *
 *   pnpm --filter @jom/game-rage solve                 # every level, 4 worker threads
 *   pnpm --filter @jom/game-rage solve ch1-l05         # ids starting with this
 *   pnpm --filter @jom/game-rage solve ch1 --jobs 8
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import {
  InputReplayer,
  compileLevel,
  createSimState,
  distinctAttempts,
  parseLevel,
  step,
} from '@jom/engine';
import type { InputLog, SimLevel } from '@jom/engine';
import { allGates, solve, timingTolerance } from './solver.ts';

type Run = { frames: number; inputLog: InputLog };
interface Job {
  key: string;
  file: string;
  attempt: number;
  current: Run | undefined;
}
interface Outcome {
  key: string;
  run: Run | null;
  tolerance: number;
  ms: number;
}

const LEVEL_DIR = new URL('../levels/', import.meta.url);
const OUT = new URL('../levels/solutions.json', import.meta.url);
/** 8px per input switch: fewer switches, far more tolerant of human timing (measured). */
const HUMAN_CHANGE_COST = 8_000;
/** [twins, spread] per candidate: 0 = steady input only; the others are robust modes. */
const CANDIDATES = [
  [0, 2],
  [2, 2],
  [3, 2],
  [2, 1],
] as const;

/** A recording that still reaches the door with no death (levels change; runs go stale). */
function clearsCleanly(level: SimLevel, run: Run, gates: number, attempt: number) {
  const state = createSimState(level, 1, attempt);
  state.gates = gates;
  const replayer = new InputReplayer(run.inputLog);
  for (let f = 0; f < run.frames && !state.deaths; f++) step(state, replayer.maskAt(f), level);
  return state.cleared && state.deaths === 0;
}

function work(job: Job): Outcome {
  const started = performance.now();
  // Multiplayer levels are solved with every gate on — the worst case a race leader or a full
  // sabotage can produce. Gated traps only add hazards, so this run also clears any subset.
  const level = compileLevel(parseLevel(JSON.parse(readFileSync(job.file, 'utf8'))));
  const gates = allGates(level);
  const { attempt } = job;
  let best: { run: Run; tolerance: number } | null = null;
  // The current recording competes too (if it still clears), so re-solving never makes a
  // level's "Watch how" harder to copy.
  if (job.current && clearsCleanly(level, job.current, gates, attempt)) {
    best = { run: job.current, tolerance: timingTolerance(level, job.current, { gates, attempt }) };
  }
  for (const [twins, spread] of CANDIDATES) {
    const run = solve(level, { gates, changeCost: HUMAN_CHANGE_COST, twins, spread, attempt });
    if (!run) continue;
    const tolerance = timingTolerance(level, run, { gates, attempt });
    if (!best || tolerance > best.tolerance) best = { run, tolerance };
  }
  return {
    key: job.key,
    run: best?.run ?? null,
    tolerance: best?.tolerance ?? 0,
    ms: performance.now() - started,
  };
}

if (!isMainThread) {
  for (const job of workerData as Job[]) parentPort!.postMessage(work(job));
} else {
  const args = process.argv.slice(2);
  const jobsAt = args.indexOf('--jobs');
  const threads = jobsAt >= 0 ? Math.max(1, Number(args[jobsAt + 1])) : 4;
  const prefix = args.find((a, i) => !a.startsWith('--') && i !== jobsAt + 1) ?? '';
  const solutions: Record<string, Run> = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, 'utf8'))
    : {};

  const jobs: Job[] = [];
  const wanted = new Set<string>();
  for (const name of readdirSync(LEVEL_DIR)
    .filter((n) => n.endsWith('.level.json'))
    .sort()) {
    const path = fileURLToPath(new URL(name, LEVEL_DIR));
    const file = parseLevel(JSON.parse(readFileSync(path, 'utf8')));
    if (!file.id.startsWith(prefix)) continue;
    for (const attempt of distinctAttempts(compileLevel(file))) {
      const key = attempt === 1 ? file.id : `${file.id}@${attempt}`;
      wanted.add(key);
      jobs.push({ key, file: path, attempt, current: solutions[key] });
    }
  }
  // Layouts a level no longer has (a scoped trap was removed) lose their stale recordings.
  const stale = Object.keys(solutions).filter(
    (key) => key.includes('@') && key.startsWith(prefix) && !wanted.has(key),
  );
  const solved: Record<string, Run> = {};
  // Merge into what is on disk now: another solve (other levels) may be writing it too.
  const save = () => {
    const disk: Record<string, Run> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
    for (const key of stale) delete disk[key];
    writeFileSync(OUT, JSON.stringify({ ...disk, ...solved }) + '\n');
  };

  // Round-robin over the threads so they finish at about the same time.
  const shards: Job[][] = Array.from({ length: Math.min(threads, jobs.length) }, () => []);
  jobs.forEach((job, i) => shards[i % shards.length]!.push(job));
  let failed = 0;
  await Promise.all(
    shards.map(
      (shard) =>
        new Promise<void>((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), { workerData: shard });
          worker.on('message', (o: Outcome) => {
            const ms = o.ms.toFixed(0);
            if (o.run) {
              solved[o.key] = o.run;
              console.log(
                `ok    ${o.key}  cleared at frame ${o.run.frames}, ${o.run.inputLog.length} switches, ` +
                  `${Math.round(o.tolerance * 100)}% survive ±2-frame timing  (${ms}ms)`,
              );
            } else {
              failed++;
              console.log(`FAIL  ${o.key}  no zero-death clear found (${ms}ms)`);
            }
            save(); // progress survives an interruption
          });
          worker.on('error', reject);
          worker.on('exit', () => resolve());
        }),
    ),
  );
  save();
  process.exitCode = failed ? 1 : 0;
}
