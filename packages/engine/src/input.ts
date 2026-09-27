/**
 * Input as a bitmask per simulation frame (TECH_STACK.md §5). Keyboard and touch are
 * both mapped to these bits before they reach the sim, so the sim never knows which
 * device produced an input.
 */
export const Input = {
  None: 0,
  Left: 1,
  Right: 2,
  Jump: 4,
  Down: 8,
} as const;

export const INPUT_MASK_ALL = Input.Left | Input.Right | Input.Jump | Input.Down;

/**
 * Change-only input log: `[frame, mask]` pairs with strictly increasing frames. A mask
 * applies from its frame until the next entry. The mask before the first entry is 0.
 */
export type InputLog = ReadonlyArray<readonly [frame: number, mask: number]>;

export class InputRecorder {
  #log: Array<[number, number]> = [];
  #last = Input.None as number;

  /** Call once per sim frame, before stepping, with the mask that frame will use. */
  record(frame: number, mask: number): void {
    if (mask === this.#last) return;
    this.#log.push([frame, mask]);
    this.#last = mask;
  }

  get log(): InputLog {
    return this.#log;
  }

  reset(): void {
    this.#log = [];
    this.#last = Input.None;
  }
}

export class InputReplayer {
  readonly #log: InputLog;
  #index = 0;
  #mask = Input.None as number;
  #lastFrame = -1;

  constructor(log: InputLog) {
    this.#log = log;
  }

  /** Mask for `frame`. Forward-only: frames must be requested in non-decreasing order. */
  maskAt(frame: number): number {
    if (frame < this.#lastFrame) throw new RangeError('InputReplayer is forward-only');
    this.#lastFrame = frame;
    while (this.#index < this.#log.length) {
      const entry = this.#log[this.#index]!;
      if (entry[0] > frame) break;
      this.#mask = entry[1];
      this.#index++;
    }
    return this.#mask;
  }
}

export type LogValidation = { ok: true } | { ok: false; reason: string };

/**
 * Structural validation for an untrusted input log (anti-cheat groundwork,
 * SECURITY.md §4.2). Does not judge plausibility — only shape and ordering.
 */
export function validateInputLog(log: unknown, totalFrames: number): LogValidation {
  if (!Array.isArray(log)) return { ok: false, reason: 'not an array' };
  let prev = -1;
  for (let i = 0; i < log.length; i++) {
    const entry: unknown = log[i];
    if (!Array.isArray(entry) || entry.length !== 2) {
      return { ok: false, reason: `entry ${i} is not a [frame, mask] pair` };
    }
    const frame: unknown = entry[0];
    const mask: unknown = entry[1];
    if (typeof frame !== 'number' || !Number.isInteger(frame) || frame < 0) {
      return { ok: false, reason: `entry ${i} has an invalid frame` };
    }
    if (
      typeof mask !== 'number' ||
      !Number.isInteger(mask) ||
      mask < 0 ||
      (mask & ~INPUT_MASK_ALL) !== 0
    ) {
      return { ok: false, reason: `entry ${i} has an invalid mask` };
    }
    if (frame <= prev) return { ok: false, reason: `entry ${i} is out of order` };
    if (frame >= totalFrames) return { ok: false, reason: `entry ${i} is past the run end` };
    prev = frame;
  }
  return { ok: true };
}
