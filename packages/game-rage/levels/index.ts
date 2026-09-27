import { compileLevel, parseLevel } from '@jom/engine';
import type { LevelFile, SimLevel } from '@jom/engine';
import l01 from './ch1-l01-welcome.level.json' with { type: 'json' };
import l02 from './ch1-l02-trust.level.json' with { type: 'json' };
import l03 from './ch1-l03-false-trust.level.json' with { type: 'json' };
import l04 from './ch1-l04-ceiling.level.json' with { type: 'json' };
import l05 from './ch1-l05-reverse-rules.level.json' with { type: 'json' };
import l06 from './ch1-l06-greed.level.json' with { type: 'json' };
import l07 from './ch1-l07-two-doors.level.json' with { type: 'json' };
import l08 from './ch1-l08-loading.level.json' with { type: 'json' };
import l09 from './ch1-l09-upside-down.level.json' with { type: 'json' };
import l10 from './ch1-l10-all-at-once.level.json' with { type: 'json' };
import l11 from './ch2-l11-mirror-hands.level.json' with { type: 'json' };
import l12 from './ch2-l12-growth-spurt.level.json' with { type: 'json' };
import l13 from './ch2-l13-slippery.level.json' with { type: 'json' };
import l14 from './ch2-l14-look-up.level.json' with { type: 'json' };
import l15 from './ch2-l15-well-done.level.json' with { type: 'json' };
import l16 from './ch2-l16-lights-out.level.json' with { type: 'json' };
import l17 from './ch2-l17-lights-out-backwards.level.json' with { type: 'json' };
import l18 from './ch2-l18-shadow.level.json' with { type: 'json' };
import l19 from './ch2-l19-countdown.level.json' with { type: 'json' };
import l20 from './ch2-l20-spin-cycle.level.json' with { type: 'json' };
import l21 from './ch3-l21-read-this.level.json' with { type: 'json' };
import l22 from './ch3-l22-door-door-door.level.json' with { type: 'json' };
import l23 from './ch3-l23-it-learns.level.json' with { type: 'json' };
import l24 from './ch3-l24-error.level.json' with { type: 'json' };
import l25 from './ch3-l25-checkpoint.level.json' with { type: 'json' };
import l26 from './ch3-l26-remote-control.level.json' with { type: 'json' };
import l27 from './ch3-l27-small-world.level.json' with { type: 'json' };
import l28 from './ch3-l28-crowd.level.json' with { type: 'json' };
import l29 from './ch3-l29-nothing.level.json' with { type: 'json' };
import l30 from './ch3-l30-the-end.level.json' with { type: 'json' };
import l31 from './ch4-l31-encore.level.json' with { type: 'json' };
import l32 from './ch4-l32-stairway.level.json' with { type: 'json' };
import l33 from './ch4-l33-heavy-rain.level.json' with { type: 'json' };
import l34 from './ch4-l34-island-hopping.level.json' with { type: 'json' };
import l35 from './ch4-l35-low-ceiling.level.json' with { type: 'json' };
import l36 from './ch4-l36-springboard.level.json' with { type: 'json' };
import l37 from './ch4-l37-black-ice.level.json' with { type: 'json' };
import l38 from './ch4-l38-the-floor-is-leaving.level.json' with { type: 'json' };
import l39 from './ch4-l39-gravity-well.level.json' with { type: 'json' };
import l40 from './ch4-l40-just-one-more.level.json' with { type: 'json' };
import race01 from './mp-race-01-front-runner.level.json' with { type: 'json' };
import sabotage01 from './mp-sabotage-01-the-yard.level.json' with { type: 'json' };

export interface GameLevel {
  file: LevelFile;
  sim: SimLevel;
}

/** Chapter names (PRD.md §4.4–4.6), by chapter number. */
export const CHAPTERS: Readonly<Record<number, string>> = {
  1: 'Welcome',
  2: 'Now It Gets Fun',
  3: "Now It's Personal",
  // User decision 2026-09-27: a fourth chapter after "The End" — new, longer levels.
  4: 'After The End',
};

/** Chapters 1–4 in play order. Validated at load like any untrusted JSON (SECURITY.md §7). */
export const LEVELS: readonly GameLevel[] = [
  l01,
  l02,
  l03,
  l04,
  l05,
  l06,
  l07,
  l08,
  l09,
  l10,
  l11,
  l12,
  l13,
  l14,
  l15,
  l16,
  l17,
  l18,
  l19,
  l20,
  l21,
  l22,
  l23,
  l24,
  l25,
  l26,
  l27,
  l28,
  l29,
  l30,
  l31,
  l32,
  l33,
  l34,
  l35,
  l36,
  l37,
  l38,
  l39,
  l40,
].map(load);

/**
 * Multiplayer levels (PRD.md §4.8). Race levels gate traps on `'leader'`; sabotage levels
 * gate them on numbered slots that saboteurs arm. Every one must be clearable with all of its
 * gates on (test/multiplayer.test.ts) — that is the sabotage solvability check (SECURITY.md §5).
 */
export const RACE_LEVELS: readonly GameLevel[] = [race01].map(load);
export const SABOTAGE_LEVELS: readonly GameLevel[] = [sabotage01].map(load);

function load(json: unknown): GameLevel {
  const file = parseLevel(json);
  return { file, sim: compileLevel(file) };
}
