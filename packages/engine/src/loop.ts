/**
 * Fixed-timestep driver (TECH_STACK.md §5).
 *
 * The renderer calls `advance(deltaMs)` once per display frame with whatever real time
 * elapsed. The driver converts that into a whole number of fixed 60Hz sim steps and
 * returns an interpolation factor for rendering. The simulation itself never sees a
 * variable delta — that is what keeps it deterministic.
 */
export const SIM_HZ = 60;
export const STEP_MS = 1000 / SIM_HZ;
/** Catch-up cap per display frame, to prevent the spiral of death. */
export const MAX_STEPS_PER_FRAME = 5;

export interface AdvanceResult {
  /** Sim steps run during this call. */
  steps: number;
  /** 0..1 — how far real time has progressed toward the next step. For render interpolation. */
  alpha: number;
  /** Real time discarded because the catch-up cap was hit (tab switch, long GC pause). */
  droppedMs: number;
}

export interface FixedStepOptions {
  stepMs?: number;
  maxStepsPerFrame?: number;
}

export class FixedStepDriver {
  readonly #step: () => void;
  readonly #stepMs: number;
  readonly #maxSteps: number;
  #accumulator = 0;

  constructor(step: () => void, options: FixedStepOptions = {}) {
    this.#step = step;
    this.#stepMs = options.stepMs ?? STEP_MS;
    this.#maxSteps = options.maxStepsPerFrame ?? MAX_STEPS_PER_FRAME;
  }

  advance(deltaMs: number): AdvanceResult {
    this.#accumulator += Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;

    let steps = 0;
    while (this.#accumulator >= this.#stepMs && steps < this.#maxSteps) {
      this.#step();
      this.#accumulator -= this.#stepMs;
      steps++;
    }

    let droppedMs = 0;
    if (this.#accumulator >= this.#stepMs) {
      const remainder = this.#accumulator % this.#stepMs;
      droppedMs = this.#accumulator - remainder;
      this.#accumulator = remainder;
    }

    return { steps, alpha: this.#accumulator / this.#stepMs, droppedMs };
  }

  reset(): void {
    this.#accumulator = 0;
  }
}
