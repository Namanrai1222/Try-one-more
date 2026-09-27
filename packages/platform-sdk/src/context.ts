import type { PlatformContext } from './game.ts';
import type { StorageLike, TelemetryProps } from './telemetry.ts';
import { createDeviceWallet } from './wallet.ts';

/** The shell records real (non-fake) errors here; meta-traps stay quiet for a while after one. */
export const REAL_ERROR_KEY = 'jom:last-real-error';

export const saveKey = (titleId: string) => `jom:save:${titleId}:v1`;

/**
 * A PlatformContext backed by on-device storage. Storage may be missing, blocked or full —
 * every access is guarded and the game still runs, it just doesn't remember.
 */
export function createDeviceContext(opts: {
  titleId: string;
  storage: StorageLike | null;
  emit: (name: string, props?: TelemetryProps) => void;
}): PlatformContext {
  const { storage } = opts;
  const read = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const lastError = Number(read(REAL_ERROR_KEY));
  return {
    user: null,
    emit: opts.emit,
    loadProgress() {
      try {
        const raw = read(saveKey(opts.titleId));
        return raw ? (JSON.parse(raw) as unknown) : null;
      } catch {
        return null; // corrupt save: start fresh rather than crash
      }
    },
    saveProgress(state) {
      try {
        storage?.setItem(saveKey(opts.titleId), JSON.stringify(state));
      } catch {
        // quota / private mode: progress just isn't remembered
      }
    },
    lastRealErrorAt: Number.isFinite(lastError) && lastError > 0 ? lastError : null,
    wallet: createDeviceWallet(storage, opts.emit, opts.titleId),
  };
}

/** Called by the shell when something genuinely fails (never by a meta-trap). */
export function recordRealError(storage: StorageLike | null, now = Date.now()): void {
  try {
    storage?.setItem(REAL_ERROR_KEY, String(now));
  } catch {
    // nothing else to do
  }
}
