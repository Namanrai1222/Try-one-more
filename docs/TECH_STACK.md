# TECH_STACK.md — "Just One More"

**Related docs:** `PRD.md`, `SECURITY.md`, `DESIGNING.md`, `3D_MODELING.md`

---

## 1. Principles that drive every choice below

1. **Web first, mobile browser primary.** No native build in v1. The share loop dies if a
   tapped link asks for an install.
2. **Hard 3MB initial payload budget.** Median user is on 4G with a data cap. Everything
   else is negotiable; this is not.
3. **Deterministic simulation from day one.** Ghosts, replays, anti-cheat, and Sabotage
   Mode all depend on it. Retrofitting determinism is a rewrite, so it goes in at Phase 0.
4. **The platform shell is generic from Phase 2.** Game titles are plugins, not branches.
5. **Boring, cheap, well-documented infrastructure.** Solo/small team; every hour spent on
   infra is an hour not spent on level design, which is where the product actually lives.

---

## 2. Stack summary

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript (strict) | One language across game, shell, and server |
| Game renderer | **Three.js** (decided 2026-09-24, replaced Phaser 3) | 3D look with 2D movement; stylised-realistic lighting; ~141KB gzipped, lazy-loaded |
| Physics (deterministic) | Custom fixed-timestep AABB layer over Arcade | Arcade's default variable step is not deterministic |
| Platform shell | **Next.js (App Router) + React 18** | SSR for share/OG pages, routing, easy static export of game bundle |
| Styling | **Tailwind CSS** + CSS custom properties from `DESIGNING.md` tokens | Tokens live in one place, consumed by both shell and game HUD |
| State (shell) | Zustand | Tiny, no boilerplate, avoids Redux weight |
| Backend API | **Next.js Route Handlers** (Phase 2–4), split to **Fastify** service if needed | Start monolithic; split only when a real reason appears |
| Database | **PostgreSQL** via Supabase | Free tier is generous, auth included, Indian-region latency acceptable |
| Cache / counters | **Redis** (Upstash) | Death counters, rate limits, leaderboards via sorted sets |
| Realtime multiplayer | **Colyseus** (Node, authoritative rooms) | Purpose-built for authoritative room-based games; simpler than raw WS |
| Object storage | **Cloudflare R2** | Zero egress fees — critical when serving shareable clips |
| Clip encoding | `MediaRecorder` → WebM, `ffmpeg.wasm` fallback for MP4 | Client-side; no server transcode bill |
| Analytics | **PostHog** (self-host optional) | Funnels, session replay, feature flags in one tool |
| Error tracking | **Sentry** | Must be namespaced away from fake-crash meta-traps |
| Hosting | **Vercel** (shell + API), **Railway/Fly** (Colyseus) | Preview deploys per PR |
| CI | GitHub Actions | Typecheck, lint, test, Lighthouse budget, preview deploy |
| 3D (Phase 6) | **Three.js + React Three Fiber** | See `3D_MODELING.md` |

### Rejected alternatives, and why
- **Unity / Godot web export:** 10–20MB WASM payloads. Violates principle 2 outright.
- **PixiJS raw:** more control, but we'd rebuild scene management, input, and audio that
  Phaser gives free.
- **Socket.io hand-rolled rooms:** ends up being a worse Colyseus after three weeks.
- **Firebase:** fine, but Postgres relational modelling suits leaderboards and level stats
  better, and Supabase gives Postgres without the ops.
- **Matter.js physics:** far more accurate, far less deterministic, and overkill for AABB
  platforming. Reconsider only for Push Party in Phase 5.

---

## 3. Repository structure

```
just-one-more/
├─ apps/
│  ├─ web/                    # Next.js shell: home, auth, leaderboards, share pages
│  │  ├─ app/
│  │  │  ├─ (marketing)/      # landing, OG share routes
│  │  │  ├─ play/[title]/     # game host route — mounts a title plugin
│  │  │  ├─ api/              # route handlers
│  │  │  └─ layout.tsx
│  │  └─ components/
│  └─ realtime/               # Colyseus server (Phase 5)
├─ packages/
│  ├─ engine/                 # deterministic sim: fixed step, AABB, input replay
│  ├─ game-rage/              # title #1: the platformer
│  │  ├─ levels/              # *.level.json, validated against schema
│  │  ├─ traps/               # one file per trap type
│  │  └─ scenes/
│  ├─ game-push-party/        # title #2 (Phase 5)
│  ├─ platform-sdk/           # what every title imports: wallet, score, clip, taunt, telemetry
│  ├─ ui/                     # shared React components + design tokens
│  ├─ clip/                   # capture + encode + share
│  └─ config/                 # eslint, tsconfig, tailwind preset
├─ docs/                      # these five documents
└─ tooling/
   ├─ level-editor/           # internal-only authoring tool
   └─ scripts/
```

**The plugin contract** — every title implements this, and the shell knows nothing else
about it. Defining this at Phase 2, before title #2 exists, is what stops the platform
becoming one hardcoded game with a menu bolted on.

```ts
export interface GameTitle {
  id: string;
  displayName: string;
  supportsMultiplayer: boolean;
  mount(container: HTMLElement, ctx: PlatformContext): Promise<GameHandle>;
}

export interface PlatformContext {
  user: SessionUser | null;          // null = anonymous play is allowed
  emit(event: TelemetryEvent): void;
  wallet: WalletApi;                 // earn XP/coins
  clip: ClipApi;                     // start/stop rolling buffer, export
  taunt: TauntApi;
  saveProgress(state: unknown): Promise<void>;
  loadProgress<T>(): Promise<T | null>;
}

export interface GameHandle {
  pause(): void;
  resume(): void;
  destroy(): void;
}
```

---

## 4. Level data format

Levels are data, never code. This is what makes a level editor, remote level updates, and
eventually user-generated content possible without shipping new JS.

```jsonc
{
  "schema": 1,
  "id": "ch1-l01-welcome",
  "chapter": 1,
  "index": 1,
  "name": "Welcome",
  "bounds": { "w": 960, "h": 540 },
  "spawn": { "x": 64, "y": 420 },
  "goal":  { "type": "door", "x": 880, "y": 400 },
  "tiles": [ { "x": 0, "y": 480, "w": 320, "h": 60, "kind": "solid" } ],
  "traps": [
    {
      "type": "collapse",
      "target": "tile:3",
      "trigger": { "on": "playerStep", "afterSteps": 3 },
      "delayMs": 120,
      // state that persists across deaths — this is how Level 1's escalation works
      "onRetry": { "attempt": 2, "disable": true, "spawn": ["spikes@tile:3"] }
    }
  ],
  "taunts": { "pool": "chapter1", "overrides": ["already? on the first level?"] },
  "meta": { "targetDeaths": 4, "targetClearMs": 12000 }
}
```

Rules:
- A JSON Schema lives in `packages/game-rage/levels/schema.json`. CI fails on any invalid level.
- `schema` version must be bumped and migrated, never silently changed.
- `meta.targetDeaths` is checked against live analytics; a CI job flags levels that drift
  past the 10-death contract from `PRD.md` §4.2.

---

## 5. Determinism specification

This is the single most important technical decision in the project.

- **Fixed timestep:** simulate at exactly 60Hz (16.6667ms). Render interpolates; the
  simulation never sees a variable delta.
- **Accumulator pattern**, with a max of 5 catch-up steps per frame to prevent spiral-of-death.
- **No `Math.random()` in simulation code.** A seeded PRNG (`mulberry32`) is passed through
  the sim context. Seed is derived from `levelId + attemptNumber`.
- **Inputs are recorded as `(frameNumber, inputBitmask)` pairs**, not timestamps.
- **Replay = same seed + same input log ⇒ identical outcome.** There is a CI test that
  replays 50 recorded runs and asserts frame-exact end states. If this test ever goes red,
  stop and fix it before anything else.
- Float drift: keep positions in fixed-point integers (`x * 1000 | 0`) inside the sim.
  Convert to float only at render time.

What determinism buys us: ghosts (L18, L28), the Daily Trap leaderboard being trustworthy,
server-side replay verification for anti-cheat, and Sabotage Mode rollback.

---

## 6. Performance budgets

| Budget | Limit | Enforced by |
|--------|-------|-------------|
| Initial JS (gzipped) | 250KB | CI bundle-size check |
| Total initial payload | 3MB | Lighthouse CI |
| Time to interactive (4G, mid Android) | < 3.5s | Lighthouse CI |
| Frame time | < 16ms at p95 on a 4GB Android | Manual device lab + PostHog perf events |
| Respawn latency | < 400ms | Automated in-game timing assertion |
| Input → visible response | < 50ms | Manual, high-speed camera test once per phase |
| Clip encode (5s, 720p) | < 4s on mid Android | Device test |

Asset rules: sprite atlases only, WebP with PNG fallback, audio as a single sprite sheet
(`.webm` + `.m4a`), no font file over 40KB subset, no video anywhere in the core loop.

---

## 7. Data model (Postgres, abbreviated)

```sql
users            (id, handle, created_at, is_anonymous, region)
sessions         (id, user_id, started_at, device_class, referrer)
titles           (id, slug, display_name, enabled)
progress         (user_id, title_id, level_id, cleared_at, best_time_ms, deaths, PRIMARY KEY(user_id,title_id,level_id))
attempts         (id, user_id, level_id, frames, died_at_frame, cause, seed, created_at)
level_stats      (level_id, total_deaths, total_clears, p50_deaths, p50_clear_ms) -- materialised
clips            (id, user_id, level_id, storage_key, duration_ms, exported_to, created_at)
wallet           (user_id, coins, xp, updated_at)
friendships      (user_a, user_b, status, created_at)
daily_trap       (date, level_id, seed)
daily_results    (date, user_id, cleared, attempts, time_ms)
leaderboard_*    -- Redis sorted sets, Postgres only for durable snapshots
taunts           (id, text, locale, weight, tags, enabled)
```

Notes:
- `attempts.frames` stores the compressed input log, not positions. A 20-second run is
  roughly 1200 frames; bitmask-packed and gzipped that is under 400 bytes.
- Death counters live in Redis (`INCR`), flushed to `level_stats` every 60s. Never read
  them from Postgres on the hot path.
- Taunts are in the database, not the bundle, so the writing can be tuned without a deploy.

---

## 8. Phase-wise technical tasks

### Phase 0 — Foundation
- [ ] Monorepo with pnpm workspaces + Turborepo
- [ ] `packages/config`: shared tsconfig (strict, `noUncheckedIndexedAccess`), eslint, prettier
- [ ] Husky + lint-staged pre-commit
- [ ] GitHub Actions: typecheck → lint → unit test → build → bundle-size gate → preview deploy
- [ ] `packages/engine`: fixed-timestep loop, accumulator, seeded PRNG, AABB collision,
      input recorder/replayer
- [ ] **Determinism test harness** — the CI job described in §5. Build this now.
- [ ] Phaser bootstrapped inside the engine's fixed-step driver (Phaser renders, engine simulates)
- [ ] Input abstraction: keyboard + touch zones → unified bitmask
- [ ] Telemetry bus with local queue + batch flush (vendor-agnostic interface)
- [ ] Next.js shell deployed, holding page live, custom domain

### Phase 1 — MVP core loop
- [ ] Level JSON schema + validator + CI check
- [ ] Level loader with hot reload in dev
- [ ] Trap component system: `collapse`, `spike`, `saw`, `movingDoor`, `fakeGoal`
- [ ] Per-attempt persistent trap state (the `onRetry` field) — needed for Level 1's escalation
- [ ] Death → respawn state machine, budget-asserted under 400ms
- [ ] Taunt engine: weighted pool, no immediate repeat, served from a static list (DB comes in Phase 2)
- [ ] Touch controls with a 50ms latency test
- [ ] Levels 1–3 authored
- [ ] Local-only death counter in `localStorage`
- [ ] Internal level editor: JSON + live reload is enough; do not build a GUI yet

### Phase 2 — Chapter 1 + platform shell
- [ ] `packages/platform-sdk` with the `GameTitle` contract from §3
- [ ] Refactor the platformer to be a *plugin*, not the app. Do this even though there is
      only one title — it is much cheaper now than later.
- [ ] Supabase project, schema migration tooling (Drizzle or Prisma; pick one and commit)
- [ ] Anonymous session creation on first load; account upgrade path preserves progress
- [ ] Progress sync API with last-write-wins + a server-side sanity check
- [ ] Levels 4–10
- [ ] Level select + chapter UI
- [ ] Wallet schema and XP accrual
- [ ] PostHog wired: level_start, level_death, level_clear, session_end, drop_off
- [ ] Analytics dashboard for the §4.2 difficulty contract

### Phase 3 — Viral layer
- [ ] `packages/clip`: rolling 5s `MediaRecorder` buffer on a canvas capture stream
- [ ] Off-main-thread encode via Web Worker; feature-detect and degrade to a score card image
- [ ] 9:16 reframe with branding overlay and the death count burned in
- [ ] Web Share API with per-platform fallbacks (WhatsApp URL scheme, Instagram fallback = download)
- [ ] R2 upload with presigned URLs (see `SECURITY.md` §6)
- [ ] Redis death counters + 60s flush job
- [ ] Challenge links: short codes, dynamic OG image via Next.js `ImageResponse`
- [ ] Rage meter: input-frequency sampling, comedic score mapping
- [ ] Share funnel instrumentation

### Phase 4 — Chapters 2–3 + retention
- [ ] Ghost system: record/store/replay input logs (depends entirely on §5 determinism)
- [ ] Meta-trap sandbox — fake UI states must be a separate, clearly-namespaced subsystem
      that cannot be reached by real error paths, and is suppressed for 10 minutes after
      any genuine Sentry-reported error for that user
- [ ] Levels 11–30
- [ ] Daily Trap: scheduled job, deterministic seed, one attempt log per user per day
- [ ] Leaderboards on Redis sorted sets, daily Postgres snapshot
- [ ] Taunts moved to the database with an admin editor

### Phase 5 — Multiplayer + title #2
- [ ] Colyseus server, room lifecycle, reconnection handling
- [ ] Room join by link; no account required to join, only to appear on leaderboards
- [ ] State sync: server-authoritative, 20Hz snapshots, client prediction + reconciliation
- [ ] Race Mode room logic including leader-targeted trap triggering
- [ ] Sabotage Mode: trap placement budget, placement validation server-side
- [ ] Lag compensation and a clear "host migration is not supported" failure path
- [ ] `packages/game-push-party` built against the same `GameTitle` contract
- [ ] Load test: 200 concurrent rooms on one Railway instance

### Phase 6 — 3D + scale
- [ ] Three.js + R3F isolated in its own lazy-loaded chunk; 2D players must never download it
- [ ] Asset streaming + Draco/Meshopt decode (see `3D_MODELING.md`)
- [ ] CDN tuning, edge caching for level JSON
- [ ] PWA manifest, offline shell, install prompt
- [ ] Titles #3–#5

---

## 9. Environments and config

| Env | Branch | Data | Notes |
|-----|--------|------|-------|
| local | any | seeded local Postgres via Docker | no external calls |
| preview | PR branches | isolated Supabase branch | per-PR URL, robots noindex |
| staging | `main` | staging project | real device testing target |
| production | tagged release | prod | manual promote, no auto-deploy from main |

All secrets via environment variables; nothing in the repo. See `SECURITY.md` §2.
Feature flags through PostHog so half-built levels can ship dark.

---

## 10. Testing strategy

| Layer | Tool | What |
|-------|------|------|
| Unit | Vitest | engine math, trap logic, taunt weighting, level validation |
| Determinism | Vitest + fixtures | 50 recorded runs replay frame-exact (blocking) |
| Integration | Vitest + Testcontainers | API + DB, progress sync, wallet |
| E2E | Playwright | complete Level 1, verify respawn timing, mobile viewport |
| Perf | Lighthouse CI | budgets from §6, blocking on regression |
| Device | manual matrix | Redmi-class Android, iPhone SE, mid laptop, once per phase |

**Levels need playtests, not unit tests.** Budget 5 strangers per chapter before ship.
No amount of green CI tells you whether a trap is funny.
