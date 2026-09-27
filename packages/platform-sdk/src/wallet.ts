import type { StorageLike, TelemetryProps } from './telemetry.ts';

/**
 * The cross-title wallet (PRD.md §4.9): coins and XP, earn only (nothing spends yet — PRD §9
 * leaves "do coins buy anything" open). One slot for every title, so a win in Push Party and
 * a clear in the platformer add to the same balance.
 * ponytail: on the device, so a player can edit their own balance; it moves server-side with
 * accounts (TECH_STACK.md §6 `wallet` table), and the server then decides what was earned.
 */
export interface Wallet {
  coins: number;
  xp: number;
}

export interface WalletApi {
  read(): Wallet;
  /** Adds to the balance and returns it. Amounts are whole, non-negative and capped per call. */
  earn(coins: number, xp: number, reason: string): Wallet;
}

export const WALLET_KEY = 'jom:wallet:v1';
/** No single event is worth more than this; anything bigger is a bug, not a reward. */
const MAX_PER_EARN = 1000;

const amount = (n: number) =>
  Number.isFinite(n) ? Math.min(MAX_PER_EARN, Math.max(0, Math.floor(n))) : 0;
const count = (n: unknown) => (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0);

export function createDeviceWallet(
  storage: StorageLike | null,
  emit: (name: string, props?: TelemetryProps) => void,
  titleId: string,
): WalletApi {
  const read = (): Wallet => {
    try {
      const raw = JSON.parse(storage?.getItem(WALLET_KEY) ?? 'null') as Partial<Wallet> | null;
      return { coins: count(raw?.coins), xp: count(raw?.xp) };
    } catch {
      return { coins: 0, xp: 0 }; // corrupt or blocked: start from zero rather than crash
    }
  };
  return {
    read,
    earn(coins, xp, reason) {
      const c = amount(coins);
      const x = amount(xp);
      const now = read();
      if (c === 0 && x === 0) return now;
      const next = { coins: now.coins + c, xp: now.xp + x };
      try {
        storage?.setItem(WALLET_KEY, JSON.stringify(next));
      } catch {
        // quota / private mode: the balance just isn't remembered
      }
      emit('wallet_earn', { title: titleId, reason, coins: c, xp: x });
      return next;
    },
  };
}
