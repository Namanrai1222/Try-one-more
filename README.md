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

## Run with Docker

Two images from one [`Dockerfile`](Dockerfile): `web` (the Next.js site, port 3000) and
`realtime` (the Colyseus party server, port 2567). [`docker-compose.yml`](docker-compose.yml)
runs both.

```bash
docker compose up --build -d      # build locally and start; open http://localhost:3000
WEB_PORT=8080 docker compose up -d   # if port 3000 is taken
docker compose pull && docker compose up -d --no-build   # run the images CD published
docker compose down
```

Both containers have a health check; `docker compose ps` shows `healthy` once they answer.

## CI/CD

```
push / PR ──► ci (.github/workflows/ci.yml)
              format · colour tokens · fonts · typecheck · lint · tests · build · bundle budgets · audit
                │ passes on main
                ▼
              cd (.github/workflows/cd.yml)
              build web + realtime images ──► push to ghcr.io (tags: latest, commit SHA)
                │
                ▼
              smoke: docker compose pull + up --wait ──► curl the site, the OG image, the party server
```

`security.yml` runs gitleaks on every push. Images:
`ghcr.io/namanrai1222/try-one-more-web` and `ghcr.io/namanrai1222/try-one-more-realtime`.

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
