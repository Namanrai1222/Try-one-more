/**
 * Meta-traps: presentation-only lies about the game's own UI (PRD.md levels 8, 15, 24).
 * SECURITY.md §9 rules, all enforced here or in level validation, all covered by tests:
 *  - only ever imitates this game's own loading screen — never a login, permission,
 *    payment, browser or OS prompt (parseLevel accepts only `fakeLoading`);
 *  - any input dismisses it, and it never lasts longer than 3 seconds (parseLevel caps it);
 *  - never during a player's first session;
 *  - never within 10 minutes of a real error.
 * It has no access to real error handling — the shell passes it one timestamp.
 */
export const QUIET_AFTER_REAL_ERROR_MS = 10 * 60 * 1000;

export function metaTrapAllowed(opts: {
  sessions: number;
  lastRealErrorAt: number | null;
  now: number;
}): boolean {
  if (opts.sessions <= 1) return false;
  if (
    opts.lastRealErrorAt !== null &&
    opts.now - opts.lastRealErrorAt < QUIET_AFTER_REAL_ERROR_MS
  ) {
    return false;
  }
  return true;
}
