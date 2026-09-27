/**
 * Lazy-load boundary for the Phase 6 3D mode (3D_MODELING.md §4, the isolation rule).
 *
 * Every byte of Three.js, React Three Fiber, Rapier, and 3D assets must live behind this
 * dynamic import. Nothing in the repo may import './mode.ts' statically. A player who
 * only plays 2D downloads zero bytes of it — `tooling/scripts/check-bundle.mjs` checks
 * the initial chunks of every page in CI.
 */
export function loadThreeDMode() {
  return import('./mode.ts');
}
