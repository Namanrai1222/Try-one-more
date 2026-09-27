READ THIS FILE FIRST WHEN STARTING A CLAUDE SESSION IN THIS REPOSITORY.

# Just One More — Session Init

> Only verified facts belong in this file. Mark anything unconfirmed as
> `UNVERIFIED`. Never put secret values here — variable names only.

## What this project does

"Just One More" is a browser-first, mobile-friendly multi-game platform. Its flagship title is a
troll/rage platformer that lies to the player (all copy in English — see CLAUDE.md); the platform (accounts, coins,
leaderboards, rooms) is meant to turn clip-sharing traffic into retained players. Target:
16–26, Indian, mid-range Android, 4G, 3MB initial-load budget. Full specs in `docs/`.

## Repository structure

```
apps/web/                  Next.js 16 shell — routes: / (home), /specimen, /play/[title], /play/[title]/levels,
                           /c/[code] (challenge link + OG image), /party (multiplayer rooms);
                           assets/fonts = WOFF for OG images
apps/realtime/             Colyseus 0.18 server (@jom/realtime): party rooms; lobby rules (src/party.ts),
                           Race + Sabotage (src/match.ts), Push Party (src/push-match.ts), limits;
                           scripts/load-test.ts (load + abuse test)
packages/game-push-party/  Title #2 Push Party: shared-arena sim (src/sim.ts), client prediction,
                           Three.js renderer, input
packages/engine/           Deterministic sim (fixed step, fixed-point AABB, PRNG, input log)
  test/fixtures/           50 golden determinism runs over 3 levels (generated — see CLAUDE.md)
  scripts/                 fixtures:update, replay:headless (plain Node)
packages/game-rage/        Title #1: 40 levels in 4 chapters (levels/*.json), Daily Trap generator,
                           Three.js renderer, input, taunts, audio, progress, meta-trap gate;
                           scripts/solver.ts (+ solve.ts, daily-check.ts)
packages/platform-sdk/     Telemetry bus (local-first), GameTitle / PlatformContext contract, device context
packages/clip/             Title-agnostic clip recording (MediaRecorder) and sharing (Web Share, save, WhatsApp)
packages/ui/               Design tokens (tokens.ts = source of truth), theme.css, CONTRAST.md
packages/game-3d/          Phase 6 placeholder: lazy-load boundary + unit-scale decision
packages/config/           Shared tsconfig, ESLint config, local ESLint rules (jom/*)
tooling/scripts/           check-bundle.mjs, check-no-hex.mjs
docs/                      PRD, TECH_STACK, SECURITY, DESIGNING, 3D_MODELING (hand-authored)
.github/                   ci.yml, security.yml (gitleaks), dependabot.yml
```

## How to run it

Toolchain: Node 24 (verified v24.13.0), pnpm 10.34.5 (installed globally via npm on this machine).

| Purpose             | Command                                                       | Verified                                                             |
| ------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Install             | `pnpm install`                                                | yes (2026-09-23)                                                     |
| Dev server          | `pnpm dev` → http://localhost:3000                            | UNVERIFIED (prod server via `pnpm --filter @jom/web start` verified) |
| Build               | `pnpm build`                                                  | yes                                                                  |
| Test                | `pnpm test` (373 tests across 9 packages)                     | yes                                                                  |
| Realtime server     | `pnpm --filter @jom/realtime dev` → :2567                     | yes — `node src/index.ts`, with `/party` on `next start`             |
| Load + abuse test   | `pnpm --filter @jom/realtime load-test [rooms] [s] [workers]` | yes — runs; 200 rooms fails on this laptop (see memory.md)           |
| Lint / typecheck    | `pnpm lint` / `pnpm typecheck`                                | yes                                                                  |
| Everything CI runs  | `pnpm verify`                                                 | yes — exit 0                                                         |
| Bundle budgets      | `pnpm check:bundle` (after build)                             | yes                                                                  |
| Regenerate tokens   | `pnpm --filter @jom/ui generate`                              | yes                                                                  |
| Regenerate fixtures | `pnpm --filter @jom/engine fixtures:update`                   | yes — intentional physics changes only                               |
| Headless replay     | `pnpm --filter @jom/engine replay:headless`                   | yes — 50/50 frame-exact                                              |
| Solve levels        | `pnpm --filter @jom/game-rage solve [id] [--jobs N]`          | yes — per level and attempt layout; merges into `solutions.json`     |
| Human-timing audit  | `pnpm --filter @jom/game-rage fairness [id]`                  | yes — recorded runs survive ±2-frame timing 18–100%                  |
| Check Daily Traps   | `pnpm --filter @jom/game-rage daily:check`                    | yes — 60/60 days clearable (~5s per day)                             |
| Fonts               | `pnpm --filter @jom/web fonts`                                | yes                                                                  |

Note: `pnpm ci` is a reserved pnpm command — the aggregate script is `pnpm verify`.

## Frontend

- Framework / version: Next.js 16.3.6 (App Router, Turbopack), React 19.3.0
- Styling: Tailwind CSS 4.3.3 via `@tailwindcss/postcss`; theme in `packages/ui/theme.css`
  resets all default colours/fonts/radii so only design tokens exist
- State management: none yet (Zustand planned per TECH_STACK.md)
- Routing: `app/page.tsx`, `app/specimen/page.tsx`, `app/play/[title]/page.tsx`,
  `app/play/[title]/levels/page.tsx` (`generateStaticParams` → `rage` only; `dynamicParams = false`)
- Entry point: `apps/web/app/layout.tsx`
- Game renderer: Three.js 0.186.0 — 3D look, 2D movement — loaded only by dynamic import on
  `/play/*` and in `/party` rounds (one shared chunk for both titles, ~134KB gzipped).
  `/play/rage?level=N` starts on level N if unlocked; `/play/rage?daily=1` plays today's (UTC)
  Daily Trap.
- Progress (`jom:save:rage:v1`) and the cross-title wallet (`jom:wallet:v1`, coins and XP, earn
  only) live on the device behind `PlatformContext` until Phase 2b.

## Backend

- No Next.js route handlers yet (planned for Phase 2b).
- `apps/realtime`: a Colyseus 0.18 WebSocket server (`@colyseus/core` + `ws-transport`) that
  holds the party rooms in memory, all in one process. It runs on Node 24 directly from
  TypeScript, with no build step. Tests start a real server on port 2568, the load test on 2569. Not deployed yet (Railway is planned). It logs a JSON health line every 10s.

## Database

- Engine: none yet. Planned: Supabase Postgres (Phase 2).
- Migration tooling: undecided (Drizzle or Prisma).
- **This project's database identity:** not created — nothing to identify.

## Authentication

- None yet. Planned: anonymous-first session + Supabase Auth (magic link, Google), no passwords.

## APIs

None.

## External services

None connected. `.env.example` lists names only:

- `NEXT_PUBLIC_REALTIME_URL`: the web client's realtime server URL, also added to the CSP.
  When unset, the client uses `ws://localhost:2567` on localhost.
- `PORT`: the realtime listen port, default 2567.
- `TRUST_PROXY`: set to `1` to trust `X-Forwarded-For` behind a proxy.

## Supabase project identification

> Never assume this matches any other repository.

- Project ref / URL: **none — no Supabase project exists for this repo yet.**
- Identified from: `.env.example` (no keys), source (no Supabase client) — verified 2026-09-23.
- **Database updates must NOT go through Supabase MCP.** Approved method: to be decided with
  the migration tool in Phase 2.

## n8n configuration

Not used by this project.

## Important MCPs

| MCP                               | Scope   | Status                                                  | Used for        |
| --------------------------------- | ------- | ------------------------------------------------------- | --------------- |
| Built-in browser (Claude_Browser) | session | VERIFIED — used to check headers, fonts, tokens, canvas | UI verification |
| Playwright MCP                    | user    | FAILED (connection timed out, 2026-09-23 session)       | E2E later       |
| Vercel MCP                        | user    | REQUIRES MANUAL SETUP (needs authentication)            | deployment      |
| `gh` CLI                          | system  | installed v2.96.0; used read-only                       | GitHub          |

## Deployment

- Host / platform: Vercel (planned) — **not configured**. No git remote exists yet.
- Branch → environment mapping: planned per TECH_STACK.md §9 — not wired.
- Deploy command / pipeline: none yet.
- Environment variable management: Vercel/Railway settings (planned).

## Current project status

- Stage: Phase 0 — foundation (see `tasks.md` TASK-002).
- What works: monorepo, strict TS, lint, format, pre-commit hook, CI workflow files, the
  deterministic engine with 50-run golden determinism harness, headless replay, keyboard +
  touch → bitmask input, telemetry bus, design tokens + contrast audit, Tailwind theme,
  self-hosted fonts, holding page, token specimen, security headers, bundle budgets.
  Phase 1 (TASK-005): level format + traps, chapter 1 levels 1–3 in a 3D renderer at
  `/play/rage`, taunts, HUD, pause and result menus, synthesised sound, local progress.
  Phase 2a (TASK-006): chapter 1 complete (10 levels, 7 new mechanics, level-8 fake loading
  meta-trap), level solver, plugin contract, unlock gating, level board, home for N titles.
  Phase 3a (TASK-007): death clips with a burned-in 9:16 share card (re-rendered from the
  input log), native share / save / WhatsApp / copy fallbacks, stateless challenge links with
  OG images, challenge play of locked levels, rage meter, share telemetry.
  Phase 4a (TASK-008): chapters 2–3 (levels 11–30, eight new trap types, darkness, spin, text
  platforms, clone, ghosts), fake level-complete and fake error meta-traps, Daily Trap with
  local streaks, stored best runs, `verifyRun` replay verification.
  Phase 5a (TASK-009): the `apps/realtime` Colyseus server and `/party`. Rooms by code or link,
  Race (leader-only traps) and Sabotage (armed slots). The server is authoritative and runs
  every player's sim from their inputs, with client prediction and reconciliation. Seat
  colours, 8 emotes, results.
  Phase 5b (TASK-010): Push Party (title #2, up to 8 players on a falling floor, one shared
  server sim with client prediction), the cross-title device wallet (coins/XP, home badge),
  realtime IP-spoofing fixes, one snapshot message per beat, and the load + abuse test.
- In progress / not done: the friend list (needs accounts), the Railway deploy and a
  200-room load test on it (fails on the dev laptop, see memory.md), Phase 4b (leaderboards, verification worker, suspicion scoring,
  taunt DB + admin editor, age gate, data export/delete, Daily Trap server job), Phase 3b (global death counters, challenge count return, R2 clip
  upload, clip/OG rate limits, takedown route — all need the backend), Phase 2b backend (needs Supabase / Upstash / PostHog accounts from the
  user), public deploy + custom domain, GitHub remote, first CI run on GitHub.
- Broken / known issues: see `memory.md` → Known issues.

## Important warnings

- Never regenerate determinism fixtures to "make a test pass".
- `docs/*.md` are the user's specs and are excluded from Prettier — edit only on request.
- The CSP is **report-only** (except frame-ancestors/base-uri/object-src). Enforcing the full
  policy needs nonces — pending user decision (see memory.md).
- The preview browser pane pauses requestAnimationFrame while hidden; the game only advances
  while it renders (screenshots force frames). For two-tab party tests, bring the tab you are
  driving to the front.
- Party checks need two processes: `pnpm --filter @jom/web start` and
  `pnpm --filter @jom/realtime dev`.
