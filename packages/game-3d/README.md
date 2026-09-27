# @jom/game-3d — reserved (Phase 6)

Nothing ships from here before Phase 6, and Phase 6 only starts if the Phase 4 gate in
[`docs/3D_MODELING.md`](../../docs/3D_MODELING.md) §1 is met (D7 retention > 12%, clip export
rate > 5%).

## Rules that apply from day one

1. **Isolation.** Three.js, R3F, Rapier and every 3D asset live behind `loadThreeDMode()` in
   `src/index.ts`. Never import `src/mode.ts` or any 3D library statically. CI
   (`tooling/scripts/check-bundle.mjs`) fails if Three.js appears in any page's initial chunks.
2. **Unit scale (recorded in Phase 0, never change it):** 1 Blender unit = 1 metre = 1 game
   unit. The player capsule is exactly **1.8 units** tall. Kit pieces snap to a **0.5-unit**
   grid. Encoded as `UNITS` in `src/mode.ts`.
3. **Blender authoring conventions** are the non-negotiable list in `docs/3D_MODELING.md`
   §5.1 — read it before modelling anything:
   - Metres; transforms and modifiers applied; export with "+Y Up".
   - Origin at base centre (platforms: centre of the top surface), on the grid.
   - Naming `kit_platform_lg`, `haz_saw_wall`, `char_player`, `prop_crate_sm`; colliders
     suffixed `_col` (boxes, capsules, spheres only; hazards slightly smaller than visuals).
   - No n-gons in anything that deforms.
4. **Budgets** (§4): ≤ 4MB compressed, lazy-loaded; ≤ 40k tris on screen; ≤ 60 draw calls;
   ≤ 8 materials; ≤ 24 bones per skinned mesh.
