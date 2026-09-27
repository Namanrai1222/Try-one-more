/**
 * Proves the next N Daily Traps are clearable (default 60) with the beam-search solver.
 * Run before a release; the Phase 4b scheduled job will run it server-side ahead of each day.
 *
 *   pnpm --filter @jom/game-rage daily:check [days] [from YYYY-MM-DD]
 */
import { compileLevel, parseLevel } from '@jom/engine';
import { dailyLevel } from '../src/daily.ts';
import { utcDay } from '../src/progress.ts';
import { solve } from './solver.ts';

const days = Number(process.argv[2] ?? 60);
const from = Date.parse(`${process.argv[3] ?? utcDay()}T00:00:00Z`);
let failed = 0;
for (let d = 0; d < days; d++) {
  const day = utcDay(from + d * 86_400_000);
  const result = solve(compileLevel(parseLevel(dailyLevel(day))));
  if (!result) failed++;
  console.log(
    `${result ? 'ok  ' : 'FAIL'}  ${day}${result ? `  cleared at frame ${result.frames}` : ''}`,
  );
}
console.log(`${days - failed}/${days} clearable`);
process.exitCode = failed ? 1 : 0;
