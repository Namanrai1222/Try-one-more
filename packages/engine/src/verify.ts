import { validateInputLog } from './input.ts';
import type { InputLog } from './input.ts';
import type { SimLevel } from './level.ts';
import { replay } from './sim.ts';

/**
 * Replay verification (SECURITY.md §4.1 tiers 1–2, §4.2, §4.3). Pure and headless: the
 * server worker runs exactly this, with the same engine the client played on, so the rules
 * can never drift. Every claim is untrusted input.
 */
export interface RunClaim {
  seed: number;
  inputLog: unknown;
  /** Frames played; for a clear, the clear frame. */
  frames: number;
  cleared: boolean;
  deaths: number;
}

export interface VerifyOptions {
  /** Hard frame cap (bounds CPU per claim). Default 10 minutes of play. */
  maxFrames?: number;
  /** Developer's fastest known clear, in frames. Clears under 85% of it are rejected. */
  floorFrames?: number;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

/** "> 20 state changes per second, sustained": more than 60 changes in any 3-second window. */
const DENSITY_WINDOW = 180;
const DENSITY_MAX = 60;

export function verifyRun(level: SimLevel, claim: RunClaim, opts: VerifyOptions = {}): Verdict {
  const maxFrames = opts.maxFrames ?? 36_000;
  const { frames } = claim;
  if (!Number.isInteger(frames) || frames < 1 || frames > maxFrames) {
    return { ok: false, reason: 'frame count out of range' };
  }
  if (!Number.isInteger(claim.seed) || !Number.isInteger(claim.deaths) || claim.deaths < 0) {
    return { ok: false, reason: 'malformed claim' };
  }
  const shape = validateInputLog(claim.inputLog, frames);
  if (!shape.ok) return shape;
  const log = claim.inputLog as InputLog;
  for (let i = DENSITY_MAX; i < log.length; i++) {
    if (log[i]![0] - log[i - DENSITY_MAX]![0] < DENSITY_WINDOW) {
      return { ok: false, reason: 'superhuman input density' };
    }
  }
  if (claim.cleared && opts.floorFrames && frames < opts.floorFrames * 0.85) {
    return { ok: false, reason: 'faster than the level allows' };
  }

  const { state } = replay(level, claim.seed >>> 0, log, frames);
  if (state.cleared !== claim.cleared) return { ok: false, reason: 'outcome mismatch' };
  if (state.cleared && state.clearFrame !== frames) {
    return { ok: false, reason: 'frame count mismatch' };
  }
  if (state.deaths !== claim.deaths) return { ok: false, reason: 'death count mismatch' };
  return { ok: true };
}
