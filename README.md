# Just One More

A game that lies to you and makes you laugh while you lose. A browser-first,
mobile-friendly multi-game platform whose flagship title is a troll/rage platformer.

**Status:** Phase 0 (foundation). A deterministic physics sandbox lives at `/play/rage`.

## Specs

| Doc                                         | What it covers                                      |
| ------------------------------------------- | --------------------------------------------------- |
| [PRD](docs/PRD.md)                          | Product, level specs, metrics, phase plan           |
| [Tech stack](docs/TECH_STACK.md)            | Architecture, determinism spec, budgets, data model |
| [Security & threat model](docs/SECURITY.md) | Threat model, auth, anti-cheat, privacy (DPDP)      |
| [Design](docs/DESIGNING.md)                 | "Result Declared" concept, tokens, screens, voice   |
| [3D modelling](docs/3D_MODELING.md)         | Phase 6 3D mode, pipeline, budgets                  |

## Getting started

Requires Node 24 and pnpm 10 (`packageManager` in `package.json` pins the version).

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

| Command                        | What it does                                               |
| ------------------------------ | ---------------------------------------------------------- |
| `pnpm dev`                     | Next.js dev server for `apps/web`                          |
| `pnpm build`                   | Production build                                           |
| `pnpm test`                    | All unit tests, including the blocking determinism harness |
| `pnpm typecheck` / `pnpm lint` | Across every workspace package                             |
| `pnpm check:bundle`            | Bundle budgets + lazy-load isolation (after `pnpm build`)  |
| `pnpm check:hex`               | Fails on any hardcoded colour outside `packages/ui` tokens |
| `pnpm verify`                  | Everything CI runs, locally                                |

## Layout

```
apps/web              Next.js shell: holding page, /specimen, /play/[title]
packages/engine       Deterministic sim: fixed step, fixed-point AABB, seeded PRNG, input record/replay
packages/game-rage    Title #1. Levels as JSON; Three.js renders in 3D, the engine simulates
packages/platform-sdk What titles import from the shell: telemetry bus, GameHandle
packages/ui           Design tokens (source of truth), Tailwind theme, contrast audit
packages/game-3d      Reserved for Phase 6; lazy-load boundary only
packages/config       Shared tsconfig, ESLint config, local ESLint rules
tooling/scripts       CI checks
docs/                 The five spec documents
```
