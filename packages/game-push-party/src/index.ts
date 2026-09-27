import type { GameTitle, PlatformContext, RoomLink } from '@jom/platform-sdk';
import type { ColorToken } from '@jom/ui';

/** Listing info for the shell. Push Party is only played in a room, so it lives at /party. */
export const title: GameTitle = {
  id: 'push',
  displayName: 'Push Party',
  tagline: 'Shove your friends off a shrinking floor.',
  players: '2–8 players',
  supportsMultiplayer: true,
  href: '/party',
};

/** Seat colours (DESIGNING.md §8 Phase 5): the platformer's four, then the rest of Okabe–Ito. */
export const SEAT_TINTS: readonly ColorToken[] = [
  'marigold',
  'sky',
  'jade',
  'orchid',
  'lemon',
  'cobalt',
  'vermilion',
  'chalk',
];

export interface PushOptions {
  link: RoomLink;
  /** Wallet and telemetry. */
  ctx: PlatformContext;
  seat: number;
  onHud(hud: PushHud): void;
}

export interface PushHud {
  /** Players still on the floor, of how many started. */
  standing: number;
  total: number;
  secondsLeft: number;
  /** This player has fallen (or is falling). */
  out: boolean;
  shoveReady: boolean;
  /** What this round paid into the wallet, once it is over. */
  earned: { coins: number; xp: number } | null;
}

export interface PushController {
  destroy(): void;
}

/** Mount a Push Party round. Lazy boundary: Three.js loads here, never with the page. */
export async function mountPush(
  container: HTMLElement,
  options: PushOptions,
): Promise<PushController> {
  const { createPush } = await import('./game.ts');
  return createPush(container, options);
}
