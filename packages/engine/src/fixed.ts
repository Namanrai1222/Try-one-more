/**
 * Fixed-point units (TECH_STACK.md §5).
 *
 * Inside the simulation every position and velocity is an integer number of
 * milli-pixels. Integers are exact in IEEE-754 doubles up to 2^53, so integer-only
 * arithmetic produces identical results on every JS engine and CPU. Floats appear
 * only at the edges: level loading (px → units) and rendering (units → px).
 */
export const FP = 1000;

/** Authored pixels → sim units. Level loading only; never call inside step(). */
export function toFixed(px: number): number {
  return (px * FP) | 0;
}

/** Sim units → pixels. Render time only. */
export function toPx(units: number): number {
  return units / FP;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
