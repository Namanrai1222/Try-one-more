/**
 * Rage meter (PRD.md §4.7): how hard the buttons got hit on the way to a clear, surfaced as
 * one printed line on the result slip — deliberately not a gauge (DESIGNING.md §8 Phase 3).
 * Presentation only; it never touches the simulation.
 */
export interface Rage {
  /** 0–99. */
  score: number;
  line: string;
}

const LINES: readonly (readonly [below: number, line: string])[] = [
  [20, 'Calm. Suspiciously calm.'],
  [45, 'Mildly annoyed.'],
  [70, 'The buttons felt that.'],
  [90, 'Please put the device down gently.'],
  [100, 'Go outside. The level will wait.'],
];

/** `presses`: new buttons pressed (press edges) over `frames` of play at 60Hz. */
export function rageScore(presses: number, frames: number): Rage {
  const perSecond = presses / Math.max(frames / 60, 1);
  // Normal play is ~1–2 presses a second; mashing is 6+. ponytail: linear map, retune from
  // playtest telemetry once real input rates exist.
  const score = Math.min(99, Math.max(0, Math.round((perSecond - 1) * 15)));
  return { score, line: LINES.find(([below]) => score < below)![1] };
}
