/**
 * Placeholder for the Phase 6 "Higher and Higher" climb mode. Gated on the Phase 4 metrics in
 * 3D_MODELING.md §1 (D7 > 12%, clip export > 5%). No 3D dependency is installed yet.
 */
export const available = false as const;

/**
 * Unit scale — decided in Phase 0 because changing it later invalidates every asset
 * (3D_MODELING.md §5.1, §8): 1 Blender unit = 1 metre = 1 game unit, and the player
 * capsule is exactly 1.8 units tall. Kit pieces snap to a 0.5-unit grid.
 */
export const UNITS = {
  metresPerUnit: 1,
  playerHeight: 1.8,
  gridSnap: 0.5,
} as const;
