import type { GameHandle, GameTitle, PlatformContext, RoomLink } from '@jom/platform-sdk';
import type { DailyStreak } from './progress.ts';
import type { Rage } from './rage.ts';

export { liveStreak, readProgress, unlockedIndex, utcDay } from './progress.ts';
/** Input bits, for shells that show which keys a demo is pressing (`HudState.demo.keys`). */
export { Input } from '@jom/engine';
export type { BestRun, DailyStreak, Progress } from './progress.ts';

/** Listing info for the shell (home screen, /play/rage). */
export const title: GameTitle = {
  id: 'rage',
  displayName: 'Just One More',
  tagline: 'A platformer that lies to you.',
  players: '1 player',
  supportsMultiplayer: false,
};

/** Everything the shell needs to draw the HUD and menus around the game. */
export interface HudState {
  /** Increments every time a level (re)starts; lets the shell drop per-run UI state. */
  run: number;
  levelIndex: number;
  levelCount: number;
  levelName: string;
  chapter: number;
  attempt: number;
  status: 'playing' | 'paused' | 'cleared';
  /** Latest taunt; changes with every death (compare `deathId`). */
  taunt: string | null;
  deathId: number;
  /** Clear time in ms, once cleared. */
  clearMs: number | null;
  /** Lifetime deaths on this level on this device. */
  totalDeaths: number;
  muted: boolean;
  /**
   * Meta-trap (levels 8, 15, 24): the shell must draw its REAL loading screen, level-complete
   * slip or error screen, pixel-identical, and dismiss it on any input (SECURITY.md §9).
   */
  fake: 'loading' | 'complete' | 'error' | null;
  /** Countdown in seconds (one decimal) while a level timer runs. */
  timer: number | null;
  /** What the physical Left, Right and Jump inputs do right now, when not the usual. */
  bindings: readonly [string, string, string] | null;
  /** Rage meter for the run, once cleared. */
  rage: Rage | null;
  /** Daily Trap mode: today's UTC date and the streak. */
  daily: ({ day: string } & DailyStreak) | null;
  /** Up to 3 hints for this level, vaguest first ([] on the Daily Trap). The shell paces them. */
  hints: readonly string[];
  /** A recorded run exists, so "Watch how" can play it. */
  canWatch: boolean;
  /** Playing the recorded run: the keys it is pressing right now (Input bits), for the shell. */
  demo: { keys: number } | null;
}

export interface GameOptions {
  ctx: PlatformContext;
  /** CrazyGames owns Escape while its fullscreen iframe is active. */
  portal?: boolean;
  /** 0-based level to start on; clamped to the levels the player has unlocked. */
  levelIndex?: number;
  /** Opened from a challenge link: `levelIndex` may be played even if still locked. */
  challenge?: boolean;
  /** Play the Daily Trap for this UTC day (`YYYY-MM-DD`) instead of the chapters. */
  daily?: string;
  onHud(hud: HudState): void;
}

export interface GameController extends GameHandle {
  restart(): void;
  goToLevel(index: number): void;
  /**
   * Play this level's recorded run from the start, keys shown (a tutorial). Nothing it does
   * counts: no deaths, clear, unlock, best run or wallet. It hands the level back when it
   * reaches the door, on Escape outside a portal, or on `stopWatching`.
   */
  watchHow(): void;
  stopWatching(): void;
  setMuted(muted: boolean): void;
  /** Count a click or tap on the shell (e.g. on a fake screen) as input, for one frame. */
  nudge(): void;
  /**
   * 9:16 share clip of the run's last death (or its clear), with `url` burned in: MP4/WebM,
   * or a PNG card where video can't be recorded. Null before anything happened in the run.
   */
  clip(url: string): Promise<File | null>;
}

export interface PartyOptions {
  link: RoomLink;
  mode: 'race' | 'sabotage';
  level: string;
  seat: number;
  /** Runs the level: everyone in a race, only the runner in sabotage. */
  plays: boolean;
  runnerSeat: number;
  onHud(hud: PartyHud): void;
}

export interface PartyHud {
  attempt: number;
  deaths: number;
  cleared: boolean;
  secondsLeft: number | null;
  /** Race position (1 = in front). */
  place: number | null;
  /** In front — and therefore the target of the leader traps. */
  leader: boolean;
  /** Saboteurs: every slot, in canvas CSS px, and whether it can be armed right now. */
  slots: Array<{ slot: number; x: number; y: number; armed: boolean; inRange: boolean }>;
}

export interface PartyController {
  destroy(): void;
}

/** Mount a party round (Race or Sabotage). Lazy like `mountGame`: Three.js loads here. */
export async function mountParty(
  container: HTMLElement,
  options: PartyOptions,
): Promise<PartyController> {
  const { createParty } = await import('./party-game.ts');
  return createParty(container, options);
}

/**
 * Mount the rage platformer into `container`.
 * Lazy boundary: Three.js and the levels are fetched only when a game is actually mounted.
 */
export async function mountGame(
  container: HTMLElement,
  options: GameOptions,
): Promise<GameController> {
  const { createGame } = await import('./game.ts');
  return createGame(container, options);
}
