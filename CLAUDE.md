# Just One More — Project Rules

Global rules live in `~/.claude/CLAUDE.md` and apply here automatically.
This file holds **only what is specific to this repository**.

Session start: read `init.md` first, then the relevant parts of `memory.md`,
`tasks.md`, and `logic.md`. The product specs are in `docs/` (PRD, TECH_STACK, SECURITY,
DESIGNING, 3D_MODELING) — they are the source of truth for _what_ to build.

**No secret values in this file — variable names only.**

---

## Architecture

pnpm + Turborepo monorepo. `apps/web` (Next.js App Router) is the platform shell; game titles
are workspace packages that the shell mounts through a dynamic import. The simulation is a
pure, deterministic TypeScript package (`packages/engine`) that Three.js only _renders_ —
a 3D look with 2D movement (user decision 2026-09-24; the player moves on one plane):

```
browser rAF (game.ts) → FixedStepDriver.advance(delta) → step(state, inputMask, level) × N
                      → render.ts draws the interpolated state in 3D (lights, shadows, camera)
```

The same `packages/engine` code runs headless in plain Node (server-side replay verification
in Phase 4 depends on this).

`apps/realtime` (`@jom/realtime`, Colyseus 0.18) hosts party rooms and runs every sim itself
from the players' inputs:

- Race/Sabotage: one engine sim per runner. The client (`game-rage/src/party-game.ts`)
  predicts and checks the server's hash in `snap.truths`.
- Push Party (title #2, `packages/game-push-party`): one shared arena sim (`src/sim.ts`). The
  client re-simulates from every snapshot.

Both titles share the lobby rules (`apps/realtime/src/party.ts`).

## Development rules

- **Determinism is sacred** (TECH_STACK.md §5). Inside `packages/engine`:
  - integer-only positions/velocities (fixed-point, 1px = 1000 units); floats only at load/render;
  - no `Math.random()`, no `Date`, no wall-clock time — use `nextRandom(state, n)`;
  - the sim reads input only as a per-frame bitmask.
- `packages/engine/test/determinism.test.ts` is blocking. If it goes red, stop and fix it first.
  Regenerate fixtures (`pnpm --filter @jom/engine fixtures:update`) **only** for an intentional
  physics/geometry change, and say so in `memory.md`.
- **Three.js is imported only in each title's `render.ts`** (`game-rage`, `game-push-party`),
  reached only through that title's dynamic import (`mountGame`, `mountParty`, `mountPush`).
  It must never appear in a page's initial JS (`check-bundle.mjs` enforces this). Rendering
  reads sim state and never writes it.
- The Push Party sim follows the same determinism rules as `packages/engine`: integers only,
  no randomness or time, input as bitmasks, and the floor a pure function of the frame. Its
  determinism test is `packages/game-push-party/test/sim.test.ts`.
- `packages/game-3d` stays reserved for the separate full-3D climb mode (Phase 6).
- **Levels are data** (`packages/game-rage/levels/*.level.json`, validated by `parseLevel`).
  Every level needs a zero-death recorded run in `packages/game-rage/levels/solutions.json`;
  `levels.test.ts` fails if a level becomes unclearable. Generate it with the beam-search solver:
  `pnpm --filter @jom/game-rage solve [level-id-prefix] [--jobs N]` (updates `solutions.json`).
  When the solver fails, check the design before the solver — it has caught impossible levels.
  - A level whose traps or doors change between attempts (`when`) has one layout per distinct
    attempt (1–8; scope ranges must end by attempt 7). Each needs its own recording, keyed
    `id@k`; `solve` writes them, `levels.test.ts` replays them, and "Watch how" plays the one
    matching the player's current attempt.
  - `solve` merges its results into `solutions.json` as they land, so solves of different
    levels may run at the same time. Re-solving a level while another process still holds an
    older result for it lets that older result win: let it finish first.
- **Every level has traps and a real length** (user decision 2026-09-27, overriding the PRD's
  trap-free levels 2 and 29): a clean run takes 8–20s in chapters 1–3 and longer in chapter 4.
  Hidden pop-up spikes (`erupt: near`) are the standard ambush from level 1 on.
- **Chapter 4, "After The End" (levels 31–40)** (user decision 2026-09-27, beyond the PRD's 30
  levels): new, longer levels with height — stairs, islands, low ceilings, springs, falling
  blocks. They were generated from a small course builder, then solved and fairness-checked like
  the rest. Unlock progress is capped at the last level that existed when it was saved;
  `unlockedIndex` opens levels added after a cleared last level. Level 29 stays empty for its first 60%
  (tested). Level 3 must stay level 2 plus saws, and level 17 the mirror of level 16: change
  them together.
- **Every level has exactly 3 `hints`** (vaguest first, plain English, ≤ 140 chars; enforced by
  `levels.test.ts`). They are presentation only and never compiled into `SimLevel`.
- **Solvable is not the same as fair.** After `solve`, run `pnpm --filter @jom/game-rage fairness`
  (recorded runs replayed with ±1–2-frame human timing error). Under ~20%: find the spot where
  runs die and test it with a simple human plan before blaming the level. The recording is also
  the level's "Watch how" tutorial, so `solve` keeps the most forgiving run it finds.
- **New mechanics default to off.** A new trap, solid flag or view hint must leave existing
  levels' compiled form and replays unchanged: replay the old fixtures and compare snapshots
  before regenerating anything.
- Daily Trap levels are generated from the UTC date (`src/daily.ts`). After changing the
  generator, run `pnpm --filter @jom/game-rage daily:check 60`.
- Titles reach platform services only through `PlatformContext` (`@jom/platform-sdk`); today
  that is `createDeviceContext` (localStorage). The server-backed context replaces it in
  Phase 2b without touching the title.
- Meta-traps (SECURITY.md §9) are gated by `metaTrapAllowed` in `game-rage/src/meta-trap.ts`
  and must look pixel-identical to the real UI they fake: the play host's `LoadingScreen`,
  `ClearedSlip` and `ErrorScreen` are **frozen** — the fakes (levels 8, 15, 24) render those
  same components. On a fake, every control may only call `game.nudge()`.
- **Clips are re-rendered from the input log, never captured.** `game.ts` must call
  `recorder.record(state.frame, mask)` before every `step`, or clips stop matching the run
  (`test/run-replay.test.ts`). Title-agnostic recording/sharing lives in `packages/clip`;
  nothing may add a file, camera, microphone or screen-capture input (SECURITY.md §6.1).
- Challenge links are stateless (`/c/rage-<level>-<deaths>`): build them only with
  `challengePath` (`apps/web/app/c/path.ts`), parse only with `parseChallenge` (Zod).
  OG images need WOFF fonts in `apps/web/assets/fonts` — regenerate with
  `pnpm --filter @jom/web fonts`.
- Stylised-realistic look: lit concrete, metal, soft shadows — but colours still come only
  from tokens (derive shades with `Color.multiplyScalar`, never hex literals).
- **Colours come only from `packages/ui/src/tokens.ts`.** After editing tokens run
  `pnpm --filter @jom/ui generate` (regenerates `tokens.css` and `CONTRAST.md`; a test enforces sync).
  `--red-pen` on `--paper` is large-text/non-text only (4.27:1).
- Any new token pairing used in UI must be added to `PAIRINGS` in `packages/ui/src/contrast.ts`.
- **Multiplayer: never trust client outcomes.**
  - Clients send only inputs `{f, m}`, slot choices and emote ids. Positions, deaths, clears
    and standings come from the server's own sims (`apps/realtime/src/match.ts`).
  - Every room message is Zod-parsed in `party-room.ts`.
  - No free-text channel (SECURITY.md §5).
  - Never use Colyseus `ctx.ip` or request headers for a client address unless the request
    went through `pinClientIp` (`server.ts` does this on every upgrade). Colyseus trusts
    client-sent `X-Real-IP` and `X-Forwarded-For`.
  - Keep one message per player per 50ms beat. The load test showed socket writes, not
    simulation, set the room limit. Add fields to `snapshot()` rather than new per-player
    periodic messages, and check with `pnpm --filter @jom/realtime load-test`.
- Multiplayer traps use `gate` (`'leader'` or slot 1–30). A gated trap is off unless the server
  sets its bit, so solo levels are unaffected. Solve MP levels with every gate on (the solve CLI
  does this); that is the worst case a saboteur can build.
- Level JSON imports need `with { type: 'json' }`, because the realtime server loads levels in
  plain Node.
- Run `pnpm verify` before declaring work done — it is exactly what CI runs.

## Coding conventions

- Language / strictness: TypeScript 6.0 strict, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly` (no enums/namespaces/parameter properties).
- Imports inside workspace packages use explicit `.ts` extensions (so Node can run them
  directly). Next.js app files use extensionless imports.
- Packages export TypeScript source (`"exports": "./src/index.ts"`); `apps/web` compiles them
  via `transpilePackages`. There is no per-package build step.
- Formatting: Prettier (100 cols, single quotes, trailing commas, LF). Pre-commit runs
  Prettier on staged files; ESLint runs in CI and `pnpm lint`.
- Linting: ESLint 9 flat config. Packages re-export `@jom/config/eslint`; `apps/web` uses
  `eslint-config-next` + the local `jom/*` rules.
- Naming: packages are `@jom/<name>`. Private class state uses `#fields`.
- Tests: Vitest, colocated in each package's `test/`.
- UI copy: **English only — no Hinglish or Hindi words** (user decision 2026-09-23, overrides
  the Hinglish voice in DESIGNING.md §4 and the PRD). Keep DESIGNING.md's tone: sentence case,
  deadpan, buttons say what happens ("Play", "Try again"), no exclamation marks in system copy.
  The product is named "Just One More" (renamed from the Hindi "Bas Ek Aur" on 2026-09-23);
  package scope `@jom/*`, ESLint rule prefix `jom/`.

## Important integrations

| Integration                             | Purpose                                                                                                          | Where configured (env var names)                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Colyseus (self-hosted, `apps/realtime`) | Party rooms: Race/Sabotage (Phase 5a), Push Party (Phase 5b)                                                     | `PORT`, `TRUST_PROXY`; web: `NEXT_PUBLIC_REALTIME_URL` (also added to CSP `connect-src`) |
| —                                       | Supabase, Upstash, R2, PostHog, Sentry arrive with Phases 2b–5b per `docs/TECH_STACK.md`. No accounts exist yet. | —                                                                                        |

## Database rules

- No database in Phase 0. Planned: Supabase Postgres (Phase 2), migration tool Drizzle **or**
  Prisma — undecided (TECH_STACK.md §8 Phase 2).
- When it lands: never modify the schema outside the migration process, and never through
  Supabase MCP (see below).

## API rules

- None yet. From the first route handler: every API boundary validates with Zod
  (SECURITY.md §7), and rate limits per SECURITY.md §7 apply.

## Authentication rules

- None yet. Planned (SECURITY.md §3): anonymous-first signed session cookie; Supabase Auth with
  magic link + Google only — **no passwords**.

## Deployment

- Platform: Vercel planned for `apps/web` — **not configured yet** (requires manual setup).
- `apps/realtime`: Railway planned (Phase 5b), **not configured**. It is one process holding
  every room in memory; scaling out needs the Colyseus Redis presence/driver.
  - Before trusting capacity, run `pnpm --filter @jom/realtime load-test 200 60` against the
    deployed box.
  - On the dev laptop 200 rooms falls short (see `memory.md`).
- Trigger / environments: per TECH_STACK.md §9 (preview per PR, staging from `main`,
  production by manual promote of a tagged release) — not yet wired.
- Pre-deploy checks: `.github/workflows/ci.yml` and `security.yml`.

## MCP usage rules

| MCP                     | Allowed for                                  | Not allowed for                                     |
| ----------------------- | -------------------------------------------- | --------------------------------------------------- |
| Supabase MCP            | Read-only inspection (once a project exists) | Schema, migrations, data changes, admin             |
| GitHub (`gh` CLI / MCP) | Repo, PR, CI operations the user asks for    | Pushing or opening PRs without being asked          |
| Browser / Playwright    | UI verification of the local app             | Claiming a flow was tested when it was not executed |

## Security requirements

- Never print `.env` values; reference variables by name only.
- Client (`'use client'`) modules may read only `NEXT_PUBLIC_*` env vars and may not import
  `server-only` or any `server/` path — enforced by `jom/no-private-env-in-client` and
  `jom/no-server-imports-in-client`.
- Do not expose the game instance on `window` (SECURITY.md §4.4).
- Meta-trap fakes (Phase 4) may never imitate login, permission, payment, browser or OS
  prompts (SECURITY.md §9).
- Minimise personal data; nothing personal in telemetry props (SECURITY.md §7–8).

## Overrides of global rules

None.
