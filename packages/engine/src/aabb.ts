/** Axis-aligned box. In the sim, all fields are integer sim units. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Strict overlap: boxes that merely touch edges do not overlap. */
export function overlaps(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  b: Readonly<Rect>,
): boolean {
  return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;
}
