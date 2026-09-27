import type { TelemetryProps } from './telemetry.ts';
import type { WalletApi } from './wallet.ts';

/**
 * The plugin contract (TECH_STACK.md §3). Every title exports a `GameTitle` for listings and
 * receives a `PlatformContext` when mounted; the shell knows nothing else about a title.
 */

/** What a mounted title hands back to the shell. */
export interface GameHandle {
  pause(): void;
  resume(): void;
  destroy(): void;
}

/** Listing info for the home screen and the /play/[id] route. */
export interface GameTitle {
  id: string;
  displayName: string;
  tagline: string;
  players: string;
  supportsMultiplayer: boolean;
  /** Where the shell sends players; `/play/<id>` when absent. */
  href?: string;
}

/**
 * The shell's connection to a party room: it owns the network client, titles never import a
 * network library. `on` returns an unsubscribe function.
 */
export interface RoomLink {
  send(type: string, message?: unknown): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server message shapes
  on(type: string, callback: (message: any) => void): () => void;
}

/** What the shell gives every title. */
export interface PlatformContext {
  /** Signed-in player, or null. Anonymous play is always allowed; accounts come with the backend. */
  user: null;
  emit(name: string, props?: TelemetryProps): void;
  /** This title's save slot. On the device today; synced to the server once accounts exist. */
  loadProgress(): unknown;
  saveProgress(state: unknown): void;
  /** When the shell last hit a real error (epoch ms), so titles can hold back meta-traps. */
  lastRealErrorAt: number | null;
  /** The coins/XP balance every title shares. */
  wallet: WalletApi;
}
