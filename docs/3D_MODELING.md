# 3D_MODELING.md — "Just One More"

**Related docs:** `PRD.md`, `TECH_STACK.md`, `SECURITY.md`, `DESIGNING.md`

---

## 1. Scope and an honest warning

**Update 2026-09-24:** the core game now renders in 3D (Three.js, stylised realistic) while
movement stays 2D on one plane. This document still governs the separate full-3D climb mode.
The original plan was: Chapters 1–3, the whole viral loop, and the first
multiplayer modes in pixel-art 2D (`DESIGNING.md` §6). 3D enters at **Phase 6**, and only
if the metrics in `PRD.md` §5 justify it.

Why the caution: a 3D mode is the single easiest way to blow the 3MB payload budget, tank
frame rate on the median 4GB Android device, and spend six weeks on assets instead of level
design. Level design is where this product lives. 3D is a growth bet, not a foundation.

**The gate:** do not begin Phase 6 3D work until Phase 4 metrics show D7 retention above 12%
and a clip export rate above 5%. If those are not met, the product's problem is not that it
lacks a third dimension.

### What 3D is actually for
| Use | Phase | Justification |
|-----|-------|---------------|
| "Higher and Higher" — a vertical climb mode (Only Up / Getting Over It lineage) | 6 | Streamer-friendly, long sessions, an entirely different clip genre |
| Push Party 3D upgrade | 6+ | Ragdoll physics is far funnier in 3D; already the most social title |
| 2.5D backgrounds for 2D levels | 5 (optional) | Cheap depth without a real 3D pipeline |
| Character in 3D for marketing/OG assets | 3 | Pre-rendered stills only, no runtime cost |

---

## 2. Art direction for 3D

The 3D mode must be recognisably the same product, not a separate game. It inherits the
palette in `DESIGNING.md` §2.1 exactly.

**Direction: "paper diorama".** The 3D world looks like the 2D world's notice-board aesthetic
folded into physical space — flat-shaded low-poly geometry, visible facet edges, matte
surfaces, and the same ink/paper/red-pen/marigold palette. No PBR metalness, no realistic
reflections, no HDRI environments. Think a cardboard model of a building, lit hard from one
side.

Why not realistic or stylised-glossy: PBR asset budgets are an order of magnitude larger,
require environment maps, and would make the 3D mode look like it came from a different
studio than the 2D game. Flat shading also renders far faster on integrated GPUs, which is
the entire device reality from `PRD.md` §3.

Concrete rules:
- **Flat shading everywhere.** Vertex normals are split at every edge; no smooth shading
  except on explicitly organic props.
- **No textures on geometry in v1.** Colour comes from vertex colours or a tiny shared
  palette texture (64×64, 16 colours). This removes almost all texture bandwidth.
- **One directional light + one ambient.** No shadow maps in v1 — use baked contact-shadow
  decals (a simple radial-gradient plane under each object).
- **Hard silhouettes.** The player must read a hazard's shape at a glance, same as the 2D
  legibility rule.
- Outlines: a single-pass inverted-hull outline in `--ink`, 1.5px screen-space. This is what
  ties the 3D look to the printed 2D look more than anything else.

---

## 3. Asset inventory

### 3.1 Characters
| Asset | Tris | Bones | Notes |
|-------|------|-------|-------|
| Player (stickman) | ≤ 900 | 18 | Capsule-based, no fingers, no facial rig |
| Ragdoll variant | ≤ 900 | 12 physics bodies | Shares the mesh, separate physics rig |
| Shadow clone | reuses player | — | Material swap only |

The player character is deliberately a stickman. It is on-brand for the rage genre, it costs
almost nothing to model or rig, and it is funnier in ragdoll.

### 3.2 Climb-mode environment ("Higher and Higher")
Built from a **modular kit**, not bespoke geometry. This is the most important production
decision in this document — a kit lets one person build a 200m climb in days instead of months.

| Module | Count | Tris each |
|--------|-------|-----------|
| Platform slabs (4 sizes) | 4 | ≤ 120 |
| Ledges / lips | 3 | ≤ 80 |
| Pillars | 3 | ≤ 150 |
| Ramps | 3 | ≤ 100 |
| Rotating/moving pieces | 4 | ≤ 200 |
| Props (crates, pipes, signs, fans) | 12 | ≤ 250 |
| Hazards (spike bed, saw, piston, swinging block) | 6 | ≤ 300 |

Total kit budget: **under 6,000 triangles** for the entire set. Levels are assembled from
instanced copies, so the memory cost is one copy regardless of how many appear.

### 3.3 Push Party 3D
| Asset | Tris |
|-------|------|
| Arena base (3 shapes) | ≤ 600 each |
| Shrinking-platform segments | ≤ 100 each |
| 8 player colour variants | material swap only |
| Knockback VFX | particles, no mesh |

---

## 4. Technical budgets

These are hard limits, enforced by a CI check on the asset directory.

| Budget | Limit | Reason |
|--------|-------|--------|
| Total 3D payload (compressed) | **4MB**, lazy-loaded | Must never load for 2D-only players |
| Triangles on screen | ≤ 40,000 | Mid-tier mobile GPU |
| Draw calls | ≤ 60 | Use `InstancedMesh` aggressively |
| Unique materials | ≤ 8 | Batching |
| Texture memory | ≤ 4MB | One palette atlas plus a few decals |
| Bones per skinned mesh | ≤ 24 | Mobile uniform limits |
| Target frame rate | 60fps desktop, 30fps floor on mid Android | Below 30 the climb mode is unplayable |
| Load time for 3D mode | ≤ 5s on 4G | Separate loading screen is acceptable here |

**The isolation rule:** every byte of Three.js, R3F, and all 3D assets must live in a
dynamically imported chunk. A player who only plays 2D must download zero bytes of it.
Verify with a bundle analyser check in CI — this is a blocking test, not a guideline.

---

## 5. Pipeline

```
Blender (author)
  → glTF 2.0 (.glb) export
  → gltf-transform (prune, dedupe, weld, join, palette, resample)
  → Draco (geometry) + Meshopt (fallback)
  → WebP for any textures
  → /packages/game-3d/assets/*.glb
  → CI validation (tris, materials, bones, file size)
  → R2 CDN with long cache + content hash
```

### 5.1 Blender authoring conventions
Non-negotiable, because breaking them costs hours downstream:
- **Units:** metres. 1 Blender unit = 1 game unit.
- **Scale:** the player capsule is exactly 1.8 units tall. Every kit piece is designed around it.
- **Orientation:** -Y forward, +Z up in Blender; the glTF exporter converts to Y-up. Always
  export with "+Y Up" ticked.
- **Origin:** at the base centre of the object, on the grid. A platform's origin is at the
  centre of its top surface, so level assembly snaps cleanly.
- **Transforms applied** before export. No unapplied scale or rotation, ever.
- **Grid snapping:** kit pieces align to a 0.5-unit grid.
- **Naming:** `kit_platform_lg`, `haz_saw_wall`, `char_player`, `prop_crate_sm`.
  Collision meshes suffixed `_col`.
- **Modifiers applied**, or explicitly baked, before export.
- **No n-gons** in anything that will deform. Quads and tris only.

### 5.2 Materials
- A single shared material per colour, referencing the palette texture by UV position.
  This is the "palette atlas" technique: all objects UV-map to a 64×64 swatch grid, so the
  whole scene can run on one material and one texture.
- Emissive is allowed only for `--marigold` collectibles and goal markers.
- Alpha blending banned except for UI-in-world elements; use alpha cutout if truly needed.

### 5.3 Collision
- **Never use render meshes for collision.** Author separate `_col` primitives: boxes,
  capsules, and spheres only.
- Collision geometry ships in the same `.glb` in a `collision` node that is hidden at runtime
  and fed to the physics engine (Rapier, compiled to WASM — see §7).
- Every hazard gets a collision volume that is *slightly smaller* than its visual. In a rage
  game, deaths must feel earned; a generous hitbox is the difference between "my fault" and
  "this game is broken", which is the legibility rule from `PRD.md` §4.1 again.

### 5.4 Rigging and animation
- Rig: 18 bones, mirrored naming (`arm_upper.L`), single root at origin.
- No IK exported — bake to FK before export.
- Animation clips, all looping unless noted: `idle`, `run`, `jump_start`, `jump_air`,
  `land`, `grab`, `slip`, `fall_flail`, `death` (non-looping).
- Keyframe rate 30fps, baked, with `gltf-transform resample` applied to strip redundant keys.
- Ragdoll takes over on death — the `death` clip exists only as a fallback for low-end devices
  where physics is disabled.

### 5.5 Optimisation commands
```bash
# Standard pass for every asset
gltf-transform prune in.glb out.glb
gltf-transform dedup out.glb out.glb
gltf-transform weld out.glb out.glb --tolerance 0.0001
gltf-transform join out.glb out.glb
gltf-transform resample out.glb out.glb
gltf-transform draco out.glb final.glb --method edgebreaker

# Verify against budgets
gltf-transform inspect final.glb
```
Wrap this in `tooling/scripts/optimize-3d.sh` and run it in CI, failing the build if any
asset exceeds the §4 budgets.

---

## 6. Runtime integration

- **Three.js + React Three Fiber**, lazy-loaded (`TECH_STACK.md` §2).
- `@react-three/drei` for helpers, but audit what it pulls in — import individual helpers,
  never the barrel.
- **Instancing:** every repeated kit piece uses `InstancedMesh`. A 200m climb is a few
  hundred instances of a dozen meshes, not a few hundred meshes.
- **Frustum culling** on by default; add manual distance culling for the climb mode since
  the player only ever sees a slice of it.
- **LOD:** two levels only (full and a ~40% decimated version) and only for props above
  200 tris. More LOD levels than that is premature for this scale.
- **Determinism:** the 3D mode must use the same fixed-timestep driver from
  `packages/engine` (`TECH_STACK.md` §5). Rapier is deterministic given a fixed step and
  identical input ordering — verify this with the same replay test harness used for 2D.
  If it cannot be made deterministic, the 3D mode ships without leaderboards and ghosts,
  and that is an acceptable tradeoff; silently shipping an unverifiable leaderboard is not.
- **Device tiering:** detect GPU class on load. Low tier disables outlines, ragdoll physics,
  and particles, and caps resolution scale at 0.7. Test on a real Redmi-class device, not
  a throttled desktop.
- **Memory:** dispose geometries, materials, and textures on mode exit. R3F does not do this
  for you for manually created resources, and a leak here will crash a 4GB phone on the
  second play.

---

## 7. Physics for 3D

- **Rapier** (`@dimforge/rapier3d-compat`), WASM, loaded with the 3D chunk.
- Fixed timestep matching the engine's 60Hz.
- Player: kinematic character controller, not a dynamic rigid body. Dynamic bodies give
  unpredictable platforming, which breaks the legibility rule.
- Ragdoll: switch to dynamic bodies only on death, for at most 2 seconds, then freeze.
  Ragdoll running forever is a frame-rate leak.
- Push Party: dynamic bodies are the entire point there, so budget for it — cap at 8 players
  plus 12 props simultaneously dynamic.
- Physics substeps capped at 4 per frame to avoid the spiral of death.

---

## 8. Phase-wise 3D tasks

Phases 0–4 contain almost no 3D work by design. What little exists is preparation that makes
Phase 6 cheap rather than painful.

### Phase 0–2 — Preparation only
- [ ] Reserve `packages/game-3d/` in the monorepo with a stub and a lazy-load boundary
- [ ] Add a CI bundle check asserting that no Three.js code appears in the main chunk
- [ ] Document the Blender conventions in §5.1 in the repo before anyone models anything
- [ ] Decide and record the unit scale (1.8 units = player height) — changing this later
      invalidates every asset

### Phase 3 — Marketing assets only
- [ ] Model the stickman once in Blender (≤900 tris)
- [ ] Pre-render stills and a short turntable for OG images, the landing page, and app icons
- [ ] Zero runtime 3D shipped in this phase

### Phase 4 — Evaluation
- [ ] Review the Phase 6 gate metrics from §1. Decide go/no-go in writing.
- [ ] If go: build a throwaway Three.js spike — one cube, one character, Rapier, on a real
      mid-tier Android — and measure frame time and payload before committing to the mode

### Phase 5 — Optional 2.5D
- [ ] Parallax background layers for 2D levels, authored as flat sprites, no 3D engine
- [ ] Evaluate whether this satisfies the "looks richer" goal at 5% of the cost. It usually does.

### Phase 6 — 3D mode build
**6a — Pipeline (Week 1)**
- [ ] `tooling/scripts/optimize-3d.sh` with the §5.5 pass
- [ ] CI asset validation against the §4 budgets, blocking
- [ ] Palette atlas texture (64×64) and the shared material
- [ ] R2 asset hosting with content-hashed filenames and long cache headers

**6b — Core assets (Weeks 2–3)**
- [ ] Player model, rig, and the nine animation clips
- [ ] Ragdoll rig and death handoff
- [ ] The full modular kit from §3.2, under the 6,000-tri total
- [ ] Collision primitives for every kit piece
- [ ] Contact-shadow decal system

**6c — Runtime (Weeks 4–5)**
- [ ] Lazy-loaded R3F scene with a dedicated loading screen
- [ ] Rapier integration on the shared fixed-timestep driver
- [ ] Kinematic character controller with climb/grab mechanics
- [ ] Inverted-hull outline pass
- [ ] Instancing, culling, LOD
- [ ] Device tiering with the low-tier degradations from §6
- [ ] Determinism verification, or an explicit decision to ship without leaderboards

**6d — Content and polish (Weeks 6–8)**
- [ ] Assemble the climb: three sections, each with a distinct trap vocabulary
- [ ] Fall-recovery design — how far back a fall sends you is the entire difficulty curve
      of this mode; tune it against the 10-death contract's spirit
- [ ] Camera: the hardest problem in a 3D climb. Budget real time for it. Player-controlled
      orbit with soft auto-framing, never a fully automatic camera.
- [ ] Mode-switch transition from the 2D shell
- [ ] Memory-leak test: enter and exit the mode 20 times, watch heap
- [ ] Device matrix test before ship

### Phase 6+ — Push Party 3D
- [ ] Arena assets
- [ ] Multiplayer ragdoll sync (server-authoritative per `SECURITY.md` §5 — the server
      simulates, clients interpolate; do not trust client ragdoll state)
- [ ] Knockback tuning

---

## 9. Definition of done for any 3D asset

1. Passes the CI budget check (tris, materials, bones, file size).
2. Transforms applied, origin correct, on the 0.5-unit grid.
3. Has a separate `_col` primitive collider, smaller than the visual for hazards.
4. Uses the shared palette material — no bespoke materials.
5. Reads correctly in silhouette at 1/4 screen size.
6. Renders correctly with outlines on and off (low-tier fallback).
7. Named per the §5.1 convention and committed with its `.blend` source file.
8. Verified on one real mid-tier Android device, not just desktop.
