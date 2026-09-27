/**
 * Human-timing check for the recorded runs: replays each level's solution with every key press
 * and release moved by a random ±1 or ±2 frames (±17–33ms, ordinary human error) and reports
 * how often it still clears. A frame-perfect route scores near 0.
 *
 * A low score means the *recorded route* is tight, not necessarily the level: check the spot
 * where the runs die (printed) with a simple human plan before redesigning. Level 10's coin over
 * the collapsing tile was a real one (no human-length tap got through); level 30's saw was
 * not (stop, let it land, then jump works for any wait).
 *
 *   pnpm --filter @jom/game-rage fairness [level-id-prefix]
 */
import { readFileSync, readdirSync } from 'node:fs';
import {
  DeathCause,
  InputReplayer,
  compileLevel,
  createSimState,
  distinctAttempts,
  parseLevel,
  step,
  toPx,
} from '@jom/engine';
import type { InputLog, SimLevel } from '@jom/engine';

const VARIANTS = 200;
const prefix = process.argv[2] ?? 'ch';
const solutions = JSON.parse(
  readFileSync(new URL('../levels/solutions.json', import.meta.url), 'utf8'),
) as Record<string, { frames: number; inputLog: InputLog }>;
const causes = Object.fromEntries(Object.entries(DeathCause).map(([k, v]) => [v, k]));

let seed = 12_345; // fixed: the report is the same every run
const random = () => (seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0) / 2 ** 32;

function jitter(log: InputLog, frames: number): InputLog {
  const out: Array<[number, number]> = [];
  for (const [f, m] of log) {
    const g = Math.max(0, f + Math.round((random() * 2 - 1) * frames));
    if (out.length && g <= out[out.length - 1]![0]) continue; // collided: a missed press
    out.push([g, m]);
  }
  return out;
}

function run(level: SimLevel, log: InputLog, frames: number, attempt: number) {
  const s = createSimState(level, 1, attempt);
  const replayer = new InputReplayer(log);
  for (let f = 0; f < frames + 120 && !s.cleared && !s.deaths; f++) {
    step(s, replayer.maskAt(f), level);
  }
  return s;
}

for (const name of readdirSync(new URL('../levels/', import.meta.url))
  .filter((n) => n.endsWith('.level.json') && n.startsWith(prefix))
  .sort()) {
  const file = parseLevel(
    JSON.parse(readFileSync(new URL(`../levels/${name}`, import.meta.url), 'utf8')),
  );
  const level = compileLevel(file);
  // Every attempt layout (traps that appear after a death) has its own recorded run.
  for (const attempt of distinctAttempts(level)) {
    const key = attempt === 1 ? file.id : `${file.id}@${attempt}`;
    const solution = solutions[key];
    if (!solution) {
      console.log(`${key.padEnd(32)} no recorded run`);
      continue;
    }
    const rates: string[] = [];
    const deaths = new Map<string, number>();
    for (const spread of [1, 2]) {
      let cleared = 0;
      for (let v = 0; v < VARIANTS; v++) {
        const s = run(level, jitter(solution.inputLog, spread), solution.frames, attempt);
        if (s.cleared && !s.deaths) cleared++;
        else if (spread === 2 && s.lastDeath) {
          const at = `${causes[s.lastDeath.cause]} x${Math.round(toPx(s.lastDeath.x) / 40) * 40}`;
          deaths.set(at, (deaths.get(at) ?? 0) + 1);
        }
      }
      rates.push(`±${spread}f ${String(Math.round((cleared / VARIANTS) * 100)).padStart(3)}%`);
    }
    const worst = [...deaths].sort((a, b) => b[1] - a[1])[0];
    console.log(
      `${key.padEnd(32)} ${rates.join('  ')}  switches ${String(solution.inputLog.length).padStart(3)}` +
        (worst ? `  most deaths: ${worst[0]}` : ''),
    );
  }
}
