# Project Memory — Just One More

Persistent memory for **this repository only**. Never copy entries in from another
project. Never record secret values.

Newest entry at the top.

## Known issues

| Issue                                                                                                                                                                    | Impact                                    | Discovered | Status                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ---------- | ----------------------------------------------- |
| Game loop verified in the browser (TASK-005). Still unverified: real phone touch, mid-range Android frame rate, sound output, the Level cleared slip visually.           | Device feel unknown                       | 2026-09-24 | Open — manual check                             |
| Not yet seen in a browser: level 12 growth, level 18 clone mesh, level 25 flag, level 27 camera lie, level 14 spring reveal, an on-screen daily streak update            | Visual polish unknown on those levels     | 2026-09-25 | Open — play-through                             |
| Multiplayer verified only with two tabs on one machine: no real latency, packet loss, reconnect, 3–8 player rounds, or touch in Push Party                               | Netcode feel unknown                      | 2026-09-26 | Open — manual check on phones                   |
| 200-room load test fails on the dev laptop (Windows, players on the same box): 12 snapshots/s, loop p99 ≈ 90–225ms. 120 rooms is near the limit here. Railway unmeasured | Capacity per instance unknown             | 2026-09-26 | Open — rerun `load-test` on Railway             |
| Device wallet: two tabs of one browser crediting at the same moment lose one update (last write wins); balance is player-editable                                        | Wallet not trustworthy until server-side  | 2026-09-26 | Open — Phase 2b (server wallet)                 |
| Level difficulty untuned: chapter 2–3 `targetDeaths` are guesses until playtests (PRD §6 difficulty audit)                                                               | Levels may be too easy or too hard        | 2026-09-25 | Open — playtest                                 |
| Chapter 4 (31–40) is proven clearable (recorded runs, fairness ≥ 20% except where noted) but no person has played it through; `targetDeaths` there is a formula          | Real difficulty unknown                   | 2026-09-28 | Open — playtest                                 |
| Clip real-time pacing, native share sheet on a phone, `wa.me` handoff, and low-end encode time are unverified (hidden browser pane)                                      | Clip quality on devices unknown           | 2026-09-25 | Open — manual check on a phone                  |
| OG image route (`/c/[code]/opengraph-image`) is CPU work with no rate limit (bounded to ≤ 100k URLs). Needs Upstash (SECURITY §7) or CDN caching.                        | Cost-DoS surface (T7)                     | 2026-09-25 | Open — Phase 3b                                 |
| `metadataBase` not set; OG URLs use the serving host. Set when the custom domain exists.                                                                                 | Wrong OG host off Vercel                  | 2026-09-25 | Open — needs domain                             |
| Phase 2b backend not started: needs user-created Supabase, Upstash and PostHog accounts. Migration tool default: Drizzle.                                                | Progress is device-only; no global count  | 2026-09-24 | Blocked — user action                           |
| Full CSP is report-only. Reviewed 2026-09-24: only Next.js inline hydration scripts violate it. Enforcing needs nonces, which makes every page dynamic.                  | Script injection not yet blocked by CSP   | 2026-09-23 | Open — user decision (nonces vs static pages)   |
| CI workflows have never run on GitHub (no remote)                                                                                                                        | Workflow YAML unverified in real CI       | 2026-09-23 | Open — needs remote                             |
| gitleaks not installed locally; only runs in CI                                                                                                                          | Secret scan unverified until first CI run | 2026-09-23 | Open                                            |
| Lighthouse CI (TTI < 3.5s, total payload 3MB) not set up; `check-bundle.mjs` covers JS only                                                                              | TTI budget unenforced                     | 2026-09-23 | Open                                            |
| Spec: DESIGNING.md §2.2 bans ALL-CAPS labels but the §3.1 mockup uses them                                                                                               | Design ambiguity                          | 2026-09-23 | Open — user decision                            |
| Spec: DESIGNING.md cites "PRD.md §4.2" for the 400ms respawn; it is in §4.1                                                                                              | Doc cross-ref                             | 2026-09-23 | Open                                            |
| Spec: `--red-pen` on `--paper` is 4.27:1 (fails AA for body text)                                                                                                        | Red body text on paper not allowed        | 2026-09-23 | Mitigated — encoded as large-text/non-text only |

## Future considerations

- Touch zone split (outer quarter = left, inner quarter = right, right half = jump) is a Phase 0
  default — validate in the Phase 1 playtest.
- Determinism fixtures are 50 synthetic seeded runs; add human-recorded runs from playtests.
- Shadow map is 1024 with PCF; drop to 512 or turn shadows off on low-end devices if frame
  time exceeds 16ms on a mid-range Android.
- Consider enabling `unrs-resolver` build script only if eslint import resolution ever breaks.

---

## Log

### 2026-09-28 — TASK-014 — Chapter 4 "After The End": levels 31–40

- **Change:** Ten new levels after level 30, each 4,700–8,000px with 11–25 traps. Unlock progress
  now extends to levels added after a player's last clear. `solve` can run for different levels
  at the same time.
- **Reason:** The user asked for more, longer, new (not copied) levels after 30, with more traps,
  all clearable.
- **Files affected:** `packages/game-rage/levels/ch4-*.level.json` (new), `levels/index.ts`,
  `levels/solutions.json`, `src/progress.ts`, `src/game.ts`, `src/index.ts`, `src/render.ts`,
  `scripts/solve.ts`, `test/levels.test.ts`, `test/progress.test.ts`,
  `apps/web/app/play/[title]/levels/level-board.tsx`, `apps/web/app/page.tsx`.
- **Technical details:**
  - **User decision:** 40 levels in four chapters (the PRD has 30). Chapter 4 is "After The End".
  - The levels came from a deterministic course builder (scratch, not in the repo). Edit the
    JSON directly from now on.
  - **Height is where the new difficulty comes from** (stairs, islands, ceilings, springs,
    gravity), and it is also where the unfair spots hid. Design numbers that hold:
    - a ceiling ≥ 100px above the floor (80 left less than a frame to clear a 40px spike);
    - ≥ 14 frames on anything that drops after you land;
    - a fast falling block triggers ≥ 70px early (~11 frames to stop);
    - ≥ 250px after a hidden spike before the next gap or hole;
    - extra runway after anything you must stop for.
  - **Human-plan recordings beat the solver on long levels.** A simple policy (hold Right, jump
    at what you see, stop while something falls, wait a beat) found runs that survive ±2-frame
    timing 24–80% where the solver's routes managed 0–52%. Levels 31, 32, 35, 36 and 38 use such
    a recording.
  - **`solve` and concurrency:** each run merges its own results into `solutions.json`, re-read
    at every write. A still-running solve re-writes its older result for a level when it saves:
    let it finish before re-solving that level.
  - Solve times: 15–30 minutes per layout for a 5,000–8,000px level on 2 threads.
- **Verification:** see TASK-013 (one `pnpm verify`).
- **Future impact:**
  - Every new level needs a clear per attempt layout plus a fairness check.
  - Long levels should keep under `MAX_MOVES` (2,400 frames = 40s) in `scripts/solver.ts`.

### 2026-09-27 — TASK-013 — Rage-bait traps from level 1 + human character

- **Change:**
  - New pop-up spike (`erupt: near`), and first-class attempt layouts (`createSimState` at any
    attempt, `attemptLayout`, `distinctAttempts`, `id@k` recordings).
  - Pop-ups, trapdoors and "moving" spikes added to 29 of levels 1–30.
  - The capsule player is now a jointed human with a run cycle (player, ghosts, clone, party
    players).
- **Reason:** The user asked for more obstacles and rage bait from level 1, and a realistic human
  instead of the "potato".
- **Files affected:**
  - engine: `src/level.ts`, `src/sim.ts`, `src/index.ts`, `test/popup.test.ts`;
  - game-rage: `src/render.ts`, `src/game.ts`, `scripts/solver.ts`, `scripts/solve.ts`,
    `scripts/fairness.ts`, `test/levels.test.ts`, `levels/*.level.json`, `levels/solutions.json`.
- **Technical details:**
  - The pop-up spike is off unless a level uses it: no fixture or replay changed.
  - A trap that appears or moves after a death creates a new attempt layout. Each layout needs
    its own recording (`id@k`). Without one, "Watch how" would show a route that dies on the
    player's current layout.
  - The human is built from primitives to the 24×32 hitbox (1 unit tall, feet at the origin).
    Every colour is a token or a `lerp`/`multiplyScalar` of tokens. Others are animated from
    their frame-to-frame movement.
  - Fixes found while solving: level 4's crusher (a pop-up forced a jump into the ceiling),
    level 23's attempt-4 coin (only a 1–2 frame tap passed), level 29's first spike (back past
    60%).
- **Verification:** see TASK-013 in `tasks.md` (verify, fairness table, browser).
- **Future impact:** Level 21's recording is tight (8%) at its early pop-up, though the jump
  window is 14 frames. Re-solve it if the solver improves.

### 2026-09-27 — TASK-012 — Difficulty rebalance: longer levels, more traps

- **Change:** 27 levels lengthened with new trapped stretches. Levels 2 and 29 got traps. Levels
  20 and 30 were softened. Hints, targets and recordings were redone.
- **Reason:** The user found some levels too tough, and some too easy ("they have nothing").
  They asked for longer play time and more traps.
- **Technical details:**
  - **User decision (overrides PRD §4.4/§4.6):** "Trust" (2) and "Nothing" (29) are no longer
    trap-free.
    - Level 2 keeps "no hidden tricks": everything there is visible.
    - Level 29 stays empty for ~60% of its length (tested), then bites.
  - **How levels grow:** insert a stretch at a point inside a floor, and shift everything
    after it right. The stretch is built from the Daily Trap's blocks, so every hazard has a
    full-speed runway.
    - Pairs must be rebuilt together: level 3 is level 2 exactly plus saws (the betrayal test
      replays level 2's run on level 3), and level 17 is the mirror of level 16.
    - Anything tuned to the level's length needs retuning: the Ceiling's crusher speed, the
      Countdown's timer.
  - **Level 10 kept compact** on purpose: the PRD's "compressed" exam.
  - **Measured results:**
    - Clean clear times went from 2–10s to 5–14s, and every level has 2–7 traps.
    - Timing tolerance is 24–100%, except level 30 at 18%. Its fake-door jump with reversed
      controls was kept deliberately for the final boss.
- **Verification:** `pnpm verify` exit 0 (373 tests). Browser: the tutorials for levels 2 and
  29 play the full new layouts.
- **Future impact:**
  - `targetDeaths` values are estimates until a playtest.
  - If a level still feels empty, extend it the same way, then run `solve`, `fairness` and
    the tests.

### 2026-09-26 — TASK-011 — Hints, "Watch how" tutorials, level fairness

- **Change:**
  - 3 hints per level.
  - A "Watch how" tutorial that replays the level's recorded run with the keys lit.
  - Level 10 fixed (coin up 20px, tile delay 3→8 frames).
  - Fake doors forgive 3px like every other hazard.
  - Human-tolerant recorded runs.
- **Reason:** The user was stuck on level 10 and asked for hints, tutorials and fixes for
  impossible levels.
- **Technical details:**
  - **"The solver cleared it" doesn't mean a human can.** Measure with
    `pnpm --filter @jom/game-rage fairness`: every switch moved ±1–2 frames, and how often it
    still clears.
  - A low score means the recorded _route_ is tight. Then test the killing spot with a simple
    human plan before redesigning.
    - Level 10's coin-over-loose-tile was genuinely unfair: no tap of 4 frames or more got
      through.
    - Levels 24 and 30's saws were fair: stop, let it land, jump.
  - **Fake doors killed on plain overlap while every other hazard has a 3px inset.** That gave a
    ~3-frame window to jump one at full speed. The fix changed physics, so determinism fixtures
    were regenerated **on purpose**: 2 of 50 runs changed their state hash only; deaths, clears
    and positions are the same.
  - **Solver lessons:**
    - A distance heuristic must count a runaway door (`goalShift`) as progress, or the beam
      hovers and records a jittery route (level 22 went from 72 switches to 3).
    - Change cost plus "human twins" (switches moved ±1–2 frames must also survive) give routes
      people can copy.
    - `solve` keeps the most forgiving of the current recording and 4 new candidates, so a
      re-solve never makes a tutorial worse.
  - **Recordings are player-facing now:** `levels/solutions.json`, moved from `test/`.
  - **Hints stay out of the compiled level**, so there are no hash or replay effects. The level
    test enforces exactly 3 hints each, in plain English with no exclamation marks.
  - **A demo must never count:** no deaths, clears, unlocks, best runs, wallet or clips. It uses
    the recording's seed (1).
- **Verification:** `pnpm verify` exit 0 (370 tests); `daily:check 60` shows 60/60. Browser
  checks are in `tasks.md` TASK-011.
- **Future impact:**
  - A new level needs 3 hints (the test fails otherwise).
  - After `solve`, run `fairness` and look at anything under ~20%.
  - A new hazard type should use `hits()` (the inset) unless plain overlap is the point.

### 2026-09-26 — TASK-010 — Phase 5b: Push Party, wallet, load test (local)

- **Change:**
  - Title #2, Push Party (a shared-arena knockout for up to 8).
  - A cross-title device wallet.
  - The realtime security fixes.
  - A 200-room load and abuse test.
  - One snapshot message per beat.
- **Reason:** User asked to "continue with phase 5b". The friend list (accounts) and the
  Railway deploy (the user's account) stay blocked.
- **Technical details:**
  - **Never trust Colyseus `ctx.ip` as it comes.** It takes X-Real-IP, X-Forwarded-For or
    X-Client-IP straight from the client. `server.ts` pins X-Real-IP on every upgrade to our
    `clientIp` (the socket address; with `TRUST_PROXY=1`, the _last_ XFF hop).
  - **Push Party has one shared sim, not one per player:** bodies touch. The server steps it
    by wall-clock time. Clients predict by re-simulating from each snapshot (the full state is
    a few hundred bytes).
    - The clock sync is closed-loop: the server reports how late each player's input stamps
      land (`late`), and the client runs a frame ahead or holds one.
    - The floor is `tileAt(frame, i, j)`: pure, so it is never sent.
  - **At scale the cost is socket writes, not simulation.** A CPU profile at 200 rooms showed
    `writev` at 44–52% and the engines at about 5%. So:
    - truth and watch now ride inside the broadcast snapshot (one write per player per beat);
    - snapshots are timed by the clock, since Windows timers make ticks about 31ms apart, so
      counting ticks gave 14Hz.
  - Rooms from one address and code brute force are exercised under load by the load test.
    Its pass marks: ≥ 18 snapshots/s, p95 gap ≤ 100ms, loop p99 ≤ 50ms, Push lag p95 ≤ 12
    frames, no drops, 3/3 attacks.
  - Wallet: one localStorage slot for all titles, earn-only, capped at 1000 per event. Titles
    earn through `ctx.wallet`, and the shell only displays it.
  - The Three.js-in-one-place rule became "only in each title's `render.ts`". Both titles
    share one lazy chunk (134KB).
- **Verification:** `pnpm verify` exit 0 (335 tests). Load-test numbers and the browser checks
  are in `tasks.md` TASK-010.
- **Future impact:**
  - Railway: set `PORT` and `TRUST_PROXY=1` and run `load-test` against it. If 200 rooms still
    miss 20Hz, options are a lower snapshot rate for Race/Sabotage others, or more processes
    (Redis presence).
  - The server wallet (Phase 2b) should award on the server from `results`; the client earn
    calls then go.

### 2026-09-26 — TASK-009 — Phase 5a: multiplayer rooms, local

- **Change:**
  - `apps/realtime`: a Colyseus server with Race and Sabotage.
  - Trap gates in the engine.
  - Two multiplayer levels.
  - The `/party` lobby, round HUD and results.
  - Seat colour tokens.
- **Reason:** User said "continue" (Phase 5). Push Party, wallet/friends and the Railway deploy
  are Phase 5b.
- **Technical details:**
  - **Netcode:**
    - The server is authoritative: it runs every player's sim from their `{f, m}` inputs.
    - A client may run 6 frames ahead of the server clock. A client stalled more than 30
      frames behind is advanced on its last input.
    - Truth `{frame, hash, gateLog}` goes out at 20Hz. When a late gate change lands in the
      past, the client re-simulates from its own input log. On a hash mismatch it asks for
      `resync` and adopts the server's state.
  - **Gates keep multiplayer out of the solo physics:**
    - Gated traps are ordinary traps with a bit.
    - `hashState` mixes gates only when non-zero, so no fixture changed.
    - Solve MP levels with **all gates on**; that is the worst case a saboteur can build.
  - **Level JSON imports need `with { type: 'json' }`.** Node's type stripping (the realtime
    server) refuses bare JSON imports (`ERR_IMPORT_ATTRIBUTE_MISSING`).
  - **Colyseus packages:**
    - Use `@colyseus/core` plus `@colyseus/ws-transport`. The `colyseus` meta package pulls in
      auth, the monitor and Redis drivers.
    - `@colyseus/testing` `boot()` listens on port 2568.
  - **Handshake race:** messages sent during `onJoin` can arrive before the client attaches
    handlers. The client therefore sends `hello`, and the room answers with `you` and `lobby`.
  - **Clean errors:** invalid create options used to leak Zod internals to the client; they
    now fail with `ServerError(400, 'Unknown mode.')`.
  - **Rejected inputs are dropped silently.** Replying `nope` produced "not playing" toasts
    for inputs still in flight when a round ended. Only the strike limit kicks (code 4403).
  - **Bundle check:** the env-name leak check must match whole identifiers (`PORT` is inside
    `TRANSPORT`, which the Colyseus SDK contains).
- **Verification:** `pnpm verify` exit 0 (315 tests). Two-tab browser checks of Race and
  Sabotage are listed in `tasks.md` TASK-009.
- **Future impact:**
  - The Railway deploy needs `PORT` and `TRUST_PROXY=1`. The web app needs
    `NEXT_PUBLIC_REALTIME_URL` (it also feeds the CSP).
  - Horizontal scaling needs the Colyseus Redis presence/driver (not installed); one process
    holds every room today.
  - Leaving mid-round counts as a loss in `standings`; nothing stores it until accounts exist.

### 2026-09-25 — TASK-008 — Phase 4a: chapters 2–3 + retention, offline

- **Change:**
  - Levels 11–30 and the eight new trap types.
  - Ghosts and the clone.
  - Fake level-complete (15) and fake error (24) meta-traps.
  - Daily Trap with local streaks.
  - `verifyRun` anti-cheat groundwork; stored best-run input logs.
- **Reason:** User asked to "continue with phase 4". The server half (leaderboards,
  verification worker, taunt DB, age gate, data export/delete) waits for Phase 2b accounts.
- **Technical details:**
  - Determinism fixtures were **regenerated on purpose**. Before that, all 50 old runs were
    replayed on the new engine: identical snapshots. The state hash just covers new fields.
    A fourth fixture level (`fixture-traps-3`) exercises every new mechanic.
  - A new mechanic must default to "off", so older levels compile byte-identically:
    `SimLevel.view` and `ice` are only present when used.
  - Terminal velocity now applies only in the direction of gravity (the spring bug:
    launches were clamped to 14px/frame). Jumps never reach the cap, so no replay changed.
  - The beam solver needed diversity (6 per 16px cell, plus a seeded random quarter): a
    greedy beam fills with runners that all hit the same fake door, or states already
    falling past a ledge.
  - The solver also caught two impossible designs: level 16's collapsing tile was too wide
    to cross before dropping, and level 21's collapsing step was too far from the last one.
    Keep "every level has a solver run" — it finds real design bugs.
  - The clone is passable until it first separates from the player (both start at spawn).
  - Meta-trap fakes reuse the real components (`ClearedSlip`, `ErrorScreen`,
    `LoadingScreen`). On a fake, every control calls `game.nudge()`: one frame of the Down bit,
    so the dismissal is real, recorded input and replays deterministically.
  - The Daily Trap is generated client-side from the UTC date, solvable by construction and
    sampled by the solver. The server job in 4b should run `daily:check` ahead of each day.
- **Verification:** `pnpm verify` exit 0 (289 tests). Browser checks are listed in `tasks.md`
  TASK-008.
- **Future impact:**
  - Leaderboard submissions send `progress.best[levelId]` to `verifyRun`.
  - The Phase 5 ghost race can replay `best` logs with `attemptTracks`/`replay`.

### 2026-09-25 — TASK-007 — Phase 3a: viral layer, offline

- **Change:**
  - Death clips with a burned-in 9:16 share card, and share with fallbacks.
  - Stateless challenge links with an OG image; challenge play of locked levels.
  - Rage meter and share telemetry.
  - New package `@jom/clip`.
- **Reason:** User asked to "continue with phase 3". Server-backed parts wait for Phase 2b
  accounts.
- **Technical details:**
  - **Clips re-simulate; they don't buffer video.** The spec asked for a "rolling 5s
    MediaRecorder buffer". Instead, the deterministic input log is replayed and the last 5s
    re-rendered into a separate 720×840 view. This costs no memory or CPU during play, gives
    a native 9:16 camera, and cannot capture anything but the game (SECURITY §6.1). It
    depends on game.ts recording `record(state.frame, mask)` before every `step`; a test
    guards that convention.
  - The death freeze-frame renders the **pre-death** state clone with the player hidden, so
    traps stay where they struck (the post-death state has already reset the attempt).
  - Challenge codes carry the numbers in the URL (`rage-7-23`), so a forged count only
    fools the forger's friends (trust tier 0). Deaths are capped at 9999 to bound OG images.
  - Satori (next/og) can't read WOFF2, so the fonts script also copies two WOFF files to
    `apps/web/assets/fonts`.
  - Share UI state must be keyed by `HudState.run`. Keying by level and attempt leaked
    "Copy link" into the next run after Replay (found in browser testing).
  - The hidden browser pane pauses rAF, so recording tests there give wrong clip durations,
    and a hidden `<video>` doesn't decode after seeking. To inspect clip content, snapshot
    the recorder's canvas instead.
- **Verification:** `pnpm verify` exit 0 (222 tests). Browser checks are listed in `tasks.md`
  TASK-007.
- **Future impact:**
  - Phase 3b: the global death counter (Redis) and the "count comes back to you" part of
    challenges need a server.
  - R2 upload only matters when clips get a public URL; today the file goes straight to the
    share sheet.

### 2026-09-24 — TASK-006 — Phase 2a: chapter 1 complete, offline

- **Change:**
  - Levels 4–10 and seven new mechanics (timed/jump spikes, crusher, coin, fake doors,
    gravity flip, odd/even attempts, fake loading).
  - A beam-search solver.
  - The `GameTitle`/`PlatformContext` contract with an on-device context.
  - Unlock gating, the level board, and a home page for N titles.
- **Reason:** User asked to "continue with phase 2". The backend half (2b) needs Supabase,
  Upstash and PostHog accounts that only the user can create, so the offline half went first.
- **Technical details:**
  - Determinism fixtures were **regenerated on purpose**. The state hash gained
    `attemptFrame` and `gravity`. Before regenerating, all 50 old runs were checked: they
    gave identical snapshots, only the hash format changed.
  - Solutions come from `scripts/solve.ts` (beam 400, hold 5 frames, 6 moves). Hand-written
    input logs were too slow to author for the later levels.
  - The meta-trap is decided in the title (`metaTrapAllowed`) from the context's
    `lastRealErrorAt` and the session count. The host only draws the same `LoadingScreen`
    it uses for real loads.
  - Camera framing: a level with anything visible above 40% of its height (a ceiling slab,
    a crusher, a high door) frames its full height. Hidden saws don't count, so Level 3
    still looks like Level 2 until the trap fires.
  - The save key is now `jom:save:<titleId>:v1`. The old `jom:progress:v1` saves are not
    migrated, since nothing was released.
- **Verification:** `pnpm verify` exit 0 (211 tests). Browser checks are listed in `tasks.md`
  TASK-006.
- **Future impact:**
  - Phase 2b replaces `createDeviceContext` with a server-backed context; titles don't
    change.
  - A new trap needs three things: a builder in `render.ts`, a fixture case in
    `fixture-format.ts`, and a solver run.

### 2026-09-24 — TASK-005 — Phase 1 core loop, in 3D

- **Change:** Built the Phase 1 core loop: level format and traps, levels 1–3, taunts, HUD,
  menus, sound, local progress. The renderer changed from Phaser to Three.js.
- **Reason:** User wanted it "more realistic, more user friendly and also 3D", then chose
  "3D look, 2D movement" and "stylised realistic".
- **Technical details:**
  - The engine stayed 2D and deterministic; Three.js only reads state, so replays and
    anti-cheat are unaffected.
  - Determinism fixtures were **regenerated on purpose** because the SimLevel shape (goal,
    traps) and the state hash (attempt, traps) changed.
  - Three r186 removed PCFSoftShadowMap; the renderer uses PCFShadowMap with
    `shadow.radius`.
  - Without a scene environment, metal renders near-black, so RoomEnvironment is used at
    0.35.
  - Fog must follow the camera distance, otherwise tall portrait screens wash out.
  - An untriggered saw must be invisible, not just off-screen: its shadow gave it away.
- **Verification:** `pnpm verify` exit 0 (176 tests); browser checks listed in `tasks.md`
  TASK-005.
- **Future impact:** New levels must ship with a recorded zero-death run in
  `packages/game-rage/test/solutions.json`. `packages/game-3d` remains for the full-3D climb.

### 2026-09-23 — TASK-004 — English spec docs + rename to Just One More

- **Change:** Translated all Hindi or Hinglish in `docs/` to English. Renamed the product from
  "Bas Ek Aur" to "Just One More", `@bas/*` to `@jom/*`, and the ESLint `bas/*` rules to `jom/*`.
- **Reason:** User: "change all the hindi to english even name change everything".
- **Files affected:** 63 files (every package manifest, import, config, and doc); see `tasks.md` TASK-004.
- **Technical details:** The telemetry storage key changed to `jom:telemetry:v1`, so any
  events queued in a browser under the old key are dropped. That is harmless because there are
  no users yet. The Hindi slur denylist in SECURITY.md was kept as a safety control.
- **Verification:** `pnpm verify` exit 0 after `pnpm install` relinked the workspace.
- **Future impact:** Use `@jom/<pkg>` for filters and imports. No Hindi words anywhere, names included.

### 2026-09-23 — TASK-003 — Switch all copy to English

- **Change:** Replaced every Hinglish UI string with English (holding page, play host, HUD,
  metadata, specimen sample). Added an English-only copy rule to `CLAUDE.md`.
- **Reason:** User request: "Make in english dont make in hindi Make the sentences and
  everything in english".
- **Files affected:** see `tasks.md` TASK-003.
- **Technical details:** This decision overrides the Hinglish voice described in
  `docs/DESIGNING.md` §4 and the PRD. The tone rules still apply (sentence case, deadpan, no
  exclamation marks). The brand name was left unchanged here and renamed in TASK-004. `CONTRAST.md` was regenerated
  because a pairing description changed.
- **Verification:** `pnpm verify` passed (exit 0) after the change.
- **Future impact:** Future taunts, level names, and UI copy must be written in English. The
  spec docs still show Hinglish examples; treat them as tone references only.

### 2026-09-23 — TASK-002 — Phase 0 foundation

- **Change:** Built the Phase 0 foundation from `docs/` (PRD §6, TECH_STACK §8, SECURITY §11,
  DESIGNING §8, 3D_MODELING §8): monorepo, config, engine, sandbox, tokens, telemetry, shell,
  CI, security baseline.
- **Reason:** User request "yes, start Phase 0".
- **Files affected:** entire repository (see `tasks.md` TASK-002 for the list).
- **Technical details:**
  - Versions chosen (verified against the npm registry on 2026-09-23): Next 16.3.6, React
    19.3.0, Tailwind 4.3.3, Phaser 3.90.0, TypeScript 6.0.3, ESLint 9.39.5, typescript-eslint
    8.70.1, Vitest 5.0.1, Turbo 2.11.3, pnpm 10.34.5.
  - Deviations from the spec, and why:
    - React 19 instead of 18 — Next 16's App Router requires React 19.
    - Tailwind v4 CSS `@theme` file instead of a JS "preset" — v4 is CSS-first; same single
      source of truth.
    - TypeScript pinned to 6.0 — typescript-eslint 8.70 supports `<6.1`; TS 7 is out but unsupported.
    - ESLint 9 not 10 — eslint-plugin-react/jsx-a11y/import (via eslint-config-next) do not
      declare ESLint 10 support.
    - pnpm 10 rather than 12 — stable, known behaviour; pinned in `packageManager`.
    - Phaser 3 kept per spec even though Phaser 4 exists.
  - Engine: integer fixed-point (1px = 1000), 60Hz fixed step, accumulator capped at 5 steps
    and discarding the backlog, mulberry32 state carried in `SimState.rng`, seed =
    fnv1a(`levelId:attempt`), change-only `[frame, mask]` input logs, FNV state hash.
  - Engine packages import with `.ts` extensions so plain Node 24 (type stripping) runs them —
    `replay:headless` proves it (50/50 frame-exact, ~34ms).
  - Fixture file stores `geometryHash` + `physicsHash`; the test explains how to regenerate when
    these change.
  - Phaser is only in `sandbox-game.ts`, reached by `import('./sandbox-game.ts')` inside
    `mountSandbox`, itself dynamically imported by the play host → never in initial JS.
  - Security headers in `apps/web/security-headers.mjs`; enforced CSP = frame-ancestors/base-uri/
    object-src; full CSP report-only.
  - `unrs-resolver` build script listed under `ignoredBuiltDependencies` (binary comes via
    optional deps; postinstall is only a fallback).
- **Verification:** `pnpm verify` exit 0 — Prettier clean, no hardcoded colours, typecheck +
  lint on all packages, 147 tests pass, production build, bundle check (initial JS 169.5–174.0KB
  gz per page vs 250KB budget; all client JS 490.1KB gz; Phaser only in a lazy chunk).
  Browser: headers, self-hosted fonts, token colours, WebGL canvas mount, no console errors.
- **Future impact:** Physics constants and sandbox geometry are now locked by fixtures. Unit
  scale for 3D (1.8 units = player height) is recorded in `packages/game-3d`.

### 2026-09-23 — TASK-001 — Documentation system bootstrap

- **Change:** Created `CLAUDE.md`, `init.md`, `memory.md`, `tasks.md`, `logic.md`, `.env.example`;
  copied the five spec docs into `docs/`.
- **Reason:** Global operating rules require the per-repo documentation system.
- **Files affected:** the files above.
- **Technical details:** Repository started empty; `git init -b main` performed. No `.env`
  exists and none was created. `.gitignore` covers `.env` and `.env.*` (except `.env.example`).
- **Verification:** Files present; no secret values anywhere (no env vars exist yet).
- **Future impact:** Every later task continues numbering from TASK-003.
