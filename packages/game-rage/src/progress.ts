import { validateInputLog } from '@jom/engine';
import type { InputLog } from '@jom/engine';

/**
 * The rage title's save slot. Stored by the shell through PlatformContext (on the device
 * today, on the server once accounts exist), so it is validated like any untrusted input.
 */
export interface Progress {
  /** Lifetime deaths per level id (PRD.md §6: death counter). */
  deaths: Record<string, number>;
  /** Highest level index the player may start from. */
  unlocked: number;
  muted: boolean;
  /** Times the game has been opened; meta-traps never run in the first (SECURITY.md §9). */
  sessions: number;
  /** Daily Trap streak. Dates are UTC `YYYY-MM-DD`. */
  daily: DailyStreak;
  /**
   * Fastest clear per level, as its input log: the stored half of the ghost system (ghost
   * race, Phase 5) and what a leaderboard submission sends (SECURITY.md §4.2).
   */
  best: Record<string, BestRun>;
}

export interface DailyStreak {
  last: string | null;
  streak: number;
  best: number;
}

export interface BestRun {
  frames: number;
  deaths: number;
  log: InputLog;
}

const count = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 ? (n as number) : 0);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BEST = 64;
const MAX_FRAMES = 36_000;

function readBest(raw: unknown): Record<string, BestRun> {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, BestRun> = {};
  for (const [id, v] of Object.entries(raw).slice(0, MAX_BEST)) {
    const r = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
    const frames = count(r.frames);
    if (frames < 1 || frames > MAX_FRAMES || !validateInputLog(r.log, frames).ok) continue;
    out[id] = { frames, deaths: count(r.deaths), log: r.log as InputLog };
  }
  return out;
}

export function readProgress(raw: unknown): Progress {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const deaths = typeof p.deaths === 'object' && p.deaths !== null ? p.deaths : {};
  const d = (typeof p.daily === 'object' && p.daily !== null ? p.daily : {}) as Record<
    string,
    unknown
  >;
  return {
    deaths: Object.fromEntries(
      Object.entries(deaths).filter(([, n]) => Number.isInteger(n) && (n as number) >= 0),
    ) as Record<string, number>,
    unlocked: count(p.unlocked),
    muted: p.muted === true,
    sessions: count(p.sessions),
    daily: {
      last: typeof d.last === 'string' && DATE.test(d.last) ? d.last : null,
      streak: count(d.streak),
      best: count(d.best),
    },
    best: readBest(p.best),
  };
}

/**
 * The furthest level the player may start, given the levels in play order. `unlocked` stops at
 * the last level that existed when it was saved; a clear of that level opens any added after it
 * (chapter 4 arrived after players had finished "The End").
 */
export function unlockedIndex(p: Progress, ids: readonly string[]): number {
  let i = p.unlocked;
  while (i < ids.length - 1 && p.best[ids[i]!]) i++;
  return i;
}

/** Today's UTC date key. The Daily Trap is the same level for everyone on the same UTC day. */
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

const dayBefore = (day: string) => utcDay(Date.parse(`${day}T00:00:00Z`) - 86_400_000);

/** Clearing today's Daily Trap: extends yesterday's streak, starts a new one, or changes nothing. */
export function recordDailyClear(daily: DailyStreak, today: string): DailyStreak {
  if (daily.last === today) return daily;
  const streak = daily.last === dayBefore(today) ? daily.streak + 1 : 1;
  return { last: today, streak, best: Math.max(daily.best, streak) };
}

/** The streak as it stands today: it survives until a whole UTC day passes without a clear. */
export const liveStreak = (daily: DailyStreak, today: string) =>
  daily.last === today || daily.last === dayBefore(today) ? daily.streak : 0;
