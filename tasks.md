# Task History — Just One More

Sequential, never reused. Newest entry at the top of the log.

**Next task number: TASK-015**

Status values: `COMPLETED` · `PARTIAL` · `BLOCKED` · `CANCELLED`

## Index

| #        | Date       | Title                                            | Status    |
| -------- | ---------- | ------------------------------------------------ | --------- |
| TASK-014 | 2026-09-28 | Chapter 4 "After The End": levels 31–40          | COMPLETED |
| TASK-013 | 2026-09-27 | Rage-bait traps from level 1 + human character   | COMPLETED |
| TASK-012 | 2026-09-27 | Difficulty rebalance: longer levels, more traps  | COMPLETED |
| TASK-011 | 2026-09-26 | Hints, "Watch how" tutorials, level fairness     | COMPLETED |
| TASK-010 | 2026-09-26 | Phase 5b — Push Party, wallet, load test (local) | PARTIAL   |
| TASK-009 | 2026-09-26 | Phase 5a — multiplayer rooms, local              | PARTIAL   |
| TASK-008 | 2026-09-25 | Phase 4a — chapters 2–3 + retention, offline     | PARTIAL   |
| TASK-007 | 2026-09-25 | Phase 3a — viral layer, offline                  | PARTIAL   |
| TASK-006 | 2026-09-24 | Phase 2a — chapter 1 complete, offline           | PARTIAL   |
| TASK-005 | 2026-09-24 | Phase 1 core loop, in 3D                         | PARTIAL   |
| TASK-004 | 2026-09-23 | English spec docs + rename to Just One More      | COMPLETED |
| TASK-003 | 2026-09-23 | Switch all copy to English                       | COMPLETED |
| TASK-002 | 2026-09-23 | Phase 0 foundation                               | PARTIAL   |
| TASK-001 | 2026-09-23 | Documentation system bootstrap                   | COMPLETED |

---

## TASK-014 — Chapter 4 "After The End": levels 31–40

- **Date:** 2026-09-27 → 2026-09-28
- **Status:** COMPLETED

### User request

"add more levels they are too small levels and too less add more level and then make those
levels new not same or old level or copied make new game after 30 and extend the size of games
add more traps and more long also they should be clearable"

### Analysis

- Chapters 1–3 are almost all flat floors with hazards on them: 960–4,563px, 3–9 traps.
- The engine already supports height (solids anywhere, springs, ceilings, gravity), but no level
  used it much.
- Nothing in the shell or game assumed 30 levels except one test, the home copy, and the unlock
  clamp (a player who finished level 30 would find level 31 locked).

### Implementation

- **Ten new levels** (`levels/ch4-l31…l40-*.level.json`), each with its own idea, 3 hints and a
  taunt:

  | #   | Name                 | Idea                                                                |
  | --- | -------------------- | ------------------------------------------------------------------- |
  | 31  | Encore               | Steps, islands and every basic ambush; the real door hops once      |
  | 32  | Stairway             | Up a staircase, across the top, down stairs that drop as you land   |
  | 33  | Heavy Rain           | Falling blocks and saws: slow ones can be outrun, fast ones cannot  |
  | 34  | Island Hopping       | Floating islands at every height; some sink, wide ones hide a spike |
  | 35  | Low Ceiling          | Ceilings over spikes and gaps: a full jump bonks, short hops pass   |
  | 36  | Springboard          | The ground leads to fake doors and a drop; springs throw you up     |
  | 37  | Black Ice            | Ice in the dark (`view.dark`), with hidden spikes and gaps          |
  | 38  | The Floor Is Leaving | Each piece of floor drops on its own timer, chasing you             |
  | 39  | Gravity Well         | Gravity flips three times; the door hangs from the ceiling          |
  | 40  | Just One More        | The finale: all of the above in one ~8,000px run                    |

- **How they were made.** A course builder (scratch script, not in the repo) laid each level out
  from a small vocabulary: steps, gaps, islands, stairs, low ceilings, springs, falling blocks
  (`crusher`), and the existing traps. It is deterministic and seeded by level id. The JSON
  files are the source of truth now: edit them directly, then re-solve.
- **Falling blocks come in two kinds**, both 32px tall:
  - **wait:** triggers 70px early and drops fast, giving ~11 frames to stop;
  - **sprint:** triggers 60px early and drops slowly from 240px. Full speed clears it with ~13
    frames to spare, and stopping is safe too.
- **Game wiring:**
  - `levels/index.ts`: imports, and `CHAPTERS[4] = 'After The End'`;
  - chapter tint jade ×0.55 in `render.ts`;
  - home copy "Four chapters, forty levels.";
  - the levels test expects 40 levels, ten per chapter.
- **Unlock fix:**
  - `unlockedIndex(progress, ids)` (`progress.ts`) moves `unlocked` past every level with a
    stored clear.
  - The game calls it on load and the level board on render, so a player who beat level 30
    before chapter 4 existed can start level 31.
  - Test added.
- **`solve.ts` merges its results into `solutions.json` as they land.** It re-reads the file
  before each write, so solves of different levels can run at the same time.
- **Human-plan recordings.** For levels 31, 32, 35, 36 and 38, the recording (and so "Watch
  how") is a run by a simple human policy: hold Right, jump at what you can see, stop while
  something falls, then wait a beat. It was adopted because it survives ±2-frame timing better
  than the solver's route (scratch tool `adopt.ts`, not in the repo).

### Fixes found by solving and fairness-checking

| Level | Problem                                                                  | Fix                                             |
| ----- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| 32    | A pop-up spike mid-staircase left nowhere to land (0% tolerance)         | Plain stairs; the spikes moved to the flat top  |
| all   | Traps chained too tightly (land from one jump straight into the next)    | +100px after saws and fast blocks               |
| all   | Sinking islands and dropping stairs gave 9–10 frames                     | 14 frames                                       |
| 33+   | Fast blocks triggered 40px early: ~4 frames to stop                      | 70px: ~11 frames                                |
| 33+   | Slow blocks: stopping at the trigger left you 6px from a crush           | Trigger 60px early, drop from 240px             |
| 35/40 | Under an 80px ceiling a 40px spike was cleared by under a frame          | Ceilings 100px; spikes under ceilings 40px wide |
| 36    | Landing from an upper-track gap straight onto a spike (solver: no clear) | Longer runways after those gaps                 |
| 39    | The ceiling hole came 100px after a hidden spike                         | Hole moved 250px after it                       |

### Result

|                  | Chapters 1–3                  | Chapter 4   |
| ---------------- | ----------------------------- | ----------- |
| Width            | 960–4,563px                   | {CH4_WIDTH} |
| Traps per level  | 3–9                           | 11–25       |
| Clean clear time | 8–17s (level 10: a 3.4s exam) | {CH4_CLEAR} |

### Testing

See TASK-013: one verify run covers both.

### Notes

- **User decision 2026-09-27:** 40 levels in four chapters (the PRD has 30).

---

## TASK-013 — Rage-bait traps from level 1 + human character

- **Date:** 2026-09-27
- **Status:** COMPLETED

### User request

"add more obsticles make more difficult from level 1 make more intresting and more
ragebaithing from level 1 and add human in it instead of potatato and more ralistic"

### Implementation

- **New trap: pop-up spike.**
  - `spike.erupt: { on: 'near', distance }` is invisible until the player's centre comes within
    `distance` px of it, then pops up and stays up for the attempt.
  - Engine `SpikeMode.Near = 3`. It defaults to off, so older levels compile and replay
    unchanged (fixtures untouched).
  - Tests in `engine/test/popup.test.ts`.
- **Attempt layouts are first-class:**
  - `createSimState(level, seed, attempt)` can start at any attempt;
  - `attemptLayout` / `distinctAttempts` list the distinct trap sets for attempts 1–8, and scope
    ranges must end by attempt 7;
  - every later layout has its own recording `id@k`, and `levels.test.ts` replays each one;
  - "Watch how" plays the recording that matches the player's current layout.
- **Rage-bait pass on levels 1–30** (29 levels; level 10 stays the compact exam):
  - pop-up spikes near the door;
  - trapdoor tiles that drop 2–4 frames after you land;
  - "moving" spikes: one spike on the first try, then after a death it sits where the jump over
    it lands.
  - Level 2 got only visible hazards (it stays honest).
  - Level 3 was rebuilt as level 2 plus saws (plus two pop-ups at the end), so the betrayal test
    still holds.
  - Level 17 was rebuilt as the mirror of level 16.
  - Hints were rewritten for 28 levels to name the new traps.
- **Hand fixes found while solving:**
  - **4 Ceiling:** the crusher went 0.34 → 0.3 px/frame. A pop-up forced a jump into the lowered
    ceiling; the solver found no clear.
  - **23 It Learns:** the attempt-4 coin sat in the gap-jump arc (only a 1–2 frame tap passed
    under it). It was raised 20px; a full jump still hits it.
  - **29 Nothing:** a spike moved 36px so the level stays empty for its first 60%.
- **Human character** (`render.ts` `makeHuman`), replacing the capsule:
  - head, hair, eyes, nose, neck, torso, and jointed arms and legs on pivots, with hands and
    shoes;
  - hoodie in the tint colour, jeans, sneakers, all colours derived from tokens;
  - turns towards the direction of travel;
  - running stride with knee bend and arm swing; tucks and throws its arms up when rising;
    flails when falling; squash, stretch and lean.
  - Ghosts, the clone and party players use the same figure (chalk ghosts; party players in their
    seat colour).
- **Targets:** `targetClearMs` ≥ 1.5× each new recording; `targetDeaths` +1 per 2 traps added
  (chapter 4: traps / 2 + 3).

### Testing

- Timing tolerance of every recording (`fairness`, share of ±2-frame replays that still clear):

  | Range     | Levels                                                                     |
  | --------- | -------------------------------------------------------------------------- |
  | 70–100%   | 1, 4, 5, 7, 8, 9, 13, 14, 18, 19, 20, 22, 23 (1–3), 26, 28, 29, 31, 36, 38 |
  | 40–69%    | 2, 10, 15, 16, 17, 23 (4–5), 24, 25, 27, 30, 33, 37{L39L40_40}             |
  | 20–39%    | 3, 6, 11, 12, 32, 34, 35{L39L40_20}                                        |
  | under 20% | 21 (8%), 23 layout 6 (18%){L39L40_LOW}                                     |
  - **Level 21:** the recording is tight at the pop-up spike near the start. A player who knows
    it is there has a 14-frame jump window (frames 57–70, measured). The level is fair; the
    recorded route is not.
  - **Level 23, layout 6:** its all-traps layout (after 5 deaths). Every layout clears.

- {VERIFY}

### Verification (built-in browser, `next start`)

- {BROWSER}

### Notes

- A solve still running with an older result for a level overwrites a newer one when it saves.
  Let it finish before re-solving that level.

---

## TASK-012 — Difficulty rebalance: longer levels, more traps

- **Date:** 2026-09-27
- **Status:** COMPLETED

### User request

"some levels are too tuough but some are too easy like they have nothing expand games timing
and add more traps"

### Analysis (measured before changing anything)

- Most levels cleared in **2–7s** of clean play, with **1–3 traps**. Chapter 1 was one screen
  (~3s) per level.
- Levels 2 "Trust" and 29 "Nothing" had **zero traps**, deliberately in the PRD (§4.4, §4.6;
  the PRD itself flags 29 as "the most likely to backfire").
- The least forgiving were 20 Spin Cycle (22%) and 30 The End (17%).

### Implementation

- **Longer levels.** 27 levels got a new stretch built from the Daily Trap's
  solvable-by-construction blocks: gap, spikes, collapse tile, saw, coin, jump-spike and
  checkpoint flag, with runways longer than a jump's landing.
  - Each stretch is inserted at a point inside a floor, and everything after it shifts right,
    so every level's original gimmick is intact.
  - Features were chosen per level to fit its theme: jump-only spikes for Reverse Rules,
    floor coins for Greed, ice kept on Slippery, a leftward section on Look Up, a second
    checkpoint flag on Checkpoint.
- **Level pairs kept exact.**
  - **Level 3** is rebuilt as level 2 exactly, plus two saws, so the betrayal still works: level
    2's recorded run still dies first to level 3's saw (test).
  - **Level 17** is rebuilt as the exact mirror of the new level 16.
- **Hand edits:**
  - **4 Ceiling:** crusher speed 0.62 → 0.42 for the longer level, so you still must sprint.
  - **19 Countdown:** timer grows with the level.
  - **21 Read This:** the climb continues (a spike on "Almost", a collapsing "Keep going.",
    then "Fine. Done.").
  - **22 Door, Door, Door:** plus a spike, a coin and a saw.
  - **29 Nothing:** empty for ~60%, then spikes and a saw, with a new taunt.
- **Softened:**
  - **20 Spin Cycle:** spin 8 → 6, and the controls swap after the first gap (x 860, was 1000).
  - **30 The End:** the controls swap right after the saw (1880, was 2000), and the coin moved
    off the landing spot (1160, was 1080).
- **Unchanged:** level 10 stays a compact exam (PRD: "compressed into a 5-second level").
- **Hints and targets.**
  - Hints were rewritten for 28 levels to match the new layouts (3 each, tested).
  - `targetClearMs` is at least 1.5× the recorded clear.
  - `targetDeaths` rises by 1 per 2 traps added.
- **Recordings.** Re-solved with the forgiving-route selection (5 candidates per level), so
  "Watch how" shows the new content.
- **Tests:**
  - `SAFE_TO_RUN` is now empty: every level punishes a player who only holds Right.
  - The "Nothing has no traps" test became "Nothing is empty for ≥ 60% of its length, then
    kills a Right-holder late".

### Result

|                                         | Before                     | After                        |
| --------------------------------------- | -------------------------- | ---------------------------- |
| Clean clear time per level              | 2.2–10.4s (chapter 1: ~3s) | 5.2–13.7s (chapter 1: 5–10s) |
| Traps per level                         | 0–6 (two levels with 0)    | 2–7 (every level has traps)  |
| Timing tolerance of recorded runs (±2f) | 17–100%                    | 24–100%, level 30 at 18%     |
| Level 20 / level 30 tolerance           | 22% / 17%                  | 84% / 18%                    |

Level 30's remaining low spot is the fake-door jump with reversed controls, a 32px full-jump
window. It is kept on purpose for the final boss; its hints spell out the move.

### Testing

- `pnpm verify` exit 0 with **373 tests**: engine 142, game-rage 137, realtime 24, ui 22,
  config 14, platform-sdk 13, web 9, game-push-party 7, clip 5.
- `pnpm --filter @jom/game-rage fairness` covers all 30 levels (table above).

### Verification (built-in browser, `next start`)

- **Level 2's "Watch how":** about 7.7s with 7 jumps (it was 3s with no traps), then "Your
  turn." A screenshot shows the new spike strip and gap.
- **Level 29's "Watch how":** 6.5s of plain walking, then a jump over the spikes, a stop while
  the saw lands, a jump over it, and the door at about 9.5s.
- **Not verified:** real players' death counts against the new `targetDeaths` (playtest), and
  every rebalanced level in the browser (all are replayed headless by the level tests).

### Notes

- **User decision 2026-09-27:** levels 2 and 29 get traps, overriding PRD §4.4/§4.6's
  trap-free design. Level 2 still has no _hidden_ tricks (everything is visible); level 29
  stays empty until its last stretch.

---

## TASK-011 — Hints, "Watch how" tutorials, level fairness

- **Date:** 2026-09-26
- **Status:** COMPLETED

### User request

"add video trutorials if someone is unable to pass the level and add hints too and some levels
are impossible to clear see them fix them add hints like im on level 10 but unable to clear it
see how we can clear it add tutorial if need give 3 hints only or tutorial not too many fix this
issue"

### Analysis

- **"Clearable" was only proven frame-perfect.** The solver's recorded runs cleared every level,
  but with split-second timing.
- **New check.** `scripts/fairness.ts` replays each recording with every key press and release
  moved by a random ±1–2 frames (±17–33ms), the size of a normal human timing error.
- **First audit:**
  - Level 10 cleared 0% of the time (±2 frames).
  - Levels 30, 22, 3, 20, 24 and 27 cleared 1–13%.
- **What was really at fault.** Checking the killing spot of each with simple human plans:
  - **Level 10, a real design fault:** no human-length tap (4 frames or more) got under the coin
    and across the loose tile. Only 2–3 frame taps did.
  - **All fake doors, a real engine fault:** fake doors killed on plain overlap. Every other hazard
    forgives 3px, so jumping a fake door at full speed left a ~3-frame window. That hit levels 7,
    10, 27 and 30.
  - **Levels 30, 24, 22 and 20, fair levels with tight routes:** the solver had picked
    split-second routes. For example, stop, let the saw land, then jump works for any wait on
    levels 24 and 30.
  - **Level 22, a solver heuristic flaw:** the door runs away as you approach, which the ranking
    scored as a setback, so the beam hovered and recorded a 72-switch jittery route.

### Implementation

- **Level 10:** coin raised 20px (y 350→330) and the loose tile's delay went from 3 to 8 frames.
  Quick taps (4–5 frames) now clear from 30 of 40 start timings, and a full jump still hits the
  coin.
- **Engine:** the `fakeGoal` kill uses the shared `hits()` 3px inset. The full-jump window over a
  fake door grows from 14 to 32px, and a medium jump now clears too.
  - Determinism fixtures were regenerated on purpose: 2 of 50 runs changed their state hash
    only. Totals are unchanged at 113 deaths and 8 clears, and all 50 replay frame-exactly
    headless.
- **Solver:**
  - `changeCost` makes each input switch cost 8px in the ranking, so it prefers steady input.
  - Robust "human twin" mode keeps a route only if copies with every switch moved ±1–2 frames
    also survive.
  - The door-shift fix: `goalShift` now counts as progress.
  - New `timingTolerance()` measure.
- **`solve` picks the most forgiving run** from 5 candidates: the current recording plus four
  solver settings. It never makes a recording worse.
- **Recordings moved** from `test/solutions.json` to `levels/solutions.json`: they are now
  player-facing content. All importers were updated, including the realtime match test.
- **Hints:**
  - Level files take optional `hints`: at most 3, each 1–140 characters, validated by
    `parseLevel`. They are presentation only and never compiled, so no hash or replay change.
  - All 30 levels have 3 hints: a nudge, then the trap named, then the exact how-to. The texts
    were checked against the level data and the recorded routes.
- **"Watch how" (the video tutorial):**
  - `watchHow()` replays the level's recorded run in the real 3D view (seed 1, as recorded).
  - The HUD exposes the keys being pressed, and the shell lights ← → Jump chips.
  - Nothing counts during a demo: no deaths, clear, unlock, best run, wallet or clip, and no
    fake screens.
  - The demo hands the level back ("Your turn.") at the door, on Esc, or on "Stop watching".
- **Pacing:**
  - "Hint" appears after 3 lifetime deaths on the level and reveals one hint at a time, 3 at
    most.
  - "Watch how" appears after 6 deaths, or once all 3 hints are read.
  - Both are also in the pause menu. The Daily Trap has neither.

### Timing tolerance of the recorded run (share of ±2-frame replays that still clear)

| Level          | Before | After | Level          | Before | After |
| -------------- | ------ | ----- | -------------- | ------ | ----- |
| 3 False Trust  | 12%    | 83%   | 21 Read This   | 34%    | 97%   |
| 4 Ceiling      | 49%    | 100%  | 22 Door x3     | 6%     | 100%  |
| 7 Two Doors    | 27%    | 93%   | 24 Error       | 18%    | 64%   |
| 10 All At Once | 0%     | 36%   | 27 Small World | 16%    | 75%   |
| 13 Slippery    | 51%    | 79%   | 30 The End     | 2%     | 17%   |
| 17 Backwards   | 31%    | 54%   | 20 Spin Cycle  | 13%    | 22%   |

The rest are 35–100%. Levels 30 and 20 stay low as recordings, but simple human plans clear them
comfortably:

- **Level 30:** the saw with stop-wait-jump.
- **Level 20:** a ~40px window at the spike.

Their hints say how.

### Files changed

| File                                                                                                | Change                                    |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `packages/engine/src/sim.ts`                                                                        | fake door uses the 3px hazard inset       |
| `packages/engine/src/level.ts`, `index.ts`, `test/level.test.ts`                                    | `hints` field + validation                |
| `packages/engine/test/fixtures/determinism-runs.json`                                               | regenerated (intentional)                 |
| `packages/game-rage/levels/*.level.json`                                                            | 3 hints each; level 10 coin + tile delay  |
| `packages/game-rage/levels/solutions.json` (moved from `test/`)                                     | re-solved, human-tolerant runs            |
| `packages/game-rage/scripts/solver.ts`, `solve.ts`, `fairness.ts` (new), `package.json`             | solver modes, selection, audit            |
| `packages/game-rage/src/game.ts`, `index.ts`                                                        | demo mode, hints on the HUD               |
| `packages/game-rage/test/levels.test.ts`, `multiplayer.test.ts`, `apps/realtime/test/match.test.ts` | hints test, new path                      |
| `apps/web/app/play/[title]/play-host.tsx`                                                           | Hint / Watch how / key chips / pause menu |

### Testing

`pnpm verify` exit 0 with **370 tests**: engine 142, game-rage 134, realtime 24, ui 22, config
14, platform-sdk 13, web 9, game-push-party 7, clip 5.

- All 30 levels have a zero-death recorded run within `targetClearMs`.
- Daily Trap: tests pass, and `daily:check 60` shows 60/60 days clearable after the solver
  change.

### Verification (built-in browser, `next start`)

- **Level 10:** no hint UI at 2 deaths. After the 3rd death "Hint" appeared, then "Hint 2 of 3";
  the card listed all three, and "Watch how" appeared after the third.
- **Watch how:** "Watching how it's done · Esc to stop". The key chips lit in sequence (→,
  →+Jump, idle while the saw lands, →+Jump). It reached the door at about 4.4s, and "Your turn."
  followed.
- **Nothing counted:** after 3 full demos the save was unchanged (3 deaths, level 11 still locked,
  no best run, no wallet change).
- **Stop and pause:** "Stop watching" ended a demo at once. The pause menu shows "Watch how it's
  done" and the hints read.
- **Not verified:**
  - The touch layout during a demo.
  - A demo of every level in the browser; the level test replays them all headless.
  - Real players' clear rates on level 10.

### Notes

- These are generated replays, not video files: no hosting, and they stay correct when a level
  changes (re-solve).
- Hints read are held in memory per level; a page reload starts from hint 1 again.

---

## TASK-010 — Phase 5b — Push Party, wallet, load test (local)

- **Date:** 2026-09-26
- **Status:** PARTIAL

### User request

"continue with phase 5b" (then "continue"). The Phase 5b items:

- Title #2, Push Party.
- The cross-title wallet and friend list.
- The Railway deploy and the 200-room load test.

Done here: everything that runs without accounts or hosting. The friend list needs accounts
(Phase 2b), and the Railway deploy needs the user's account.

### Implementation

- **Security fixes (found while building the load test):**
  - Colyseus sets `ctx.ip` from `X-Real-IP`, `X-Forwarded-For` or `X-Client-IP` exactly as the
    client sends them, so anyone could walk past the per-IP room caps.
    - `pinClientIp` now overwrites `X-Real-IP` on every WebSocket upgrade with the address we
      trust.
    - A regression test (spoofed headers) fails without the fix and passes with it.
  - `clientIp` behind a proxy now reads the **last** `X-Forwarded-For` hop, not the first; the
    first is client-controlled whenever the proxy appends.
- **Push Party (`packages/game-push-party`, title #2):**
  - `sim.ts` is a deterministic, integer-only top-down arena for 2–8 players:
    - walking with drag, and a shove (lunge plus knock-back);
    - body bounce;
    - a 10×10 floor whose rings fall at 8s, then every 10s, leaving the centre 2×2;
    - 75s rounds.
    - The floor is a pure function of the frame, so it is never sent.
  - `game.ts` is client prediction:
    - it re-simulates from each server snapshot using its own input log and the others' last
      inputs;
    - it keeps its clock just ahead using the server's per-player `late` feedback (never more
      than 10 frames past a snapshot);
    - on-screen positions are eased.
  - `render.ts` draws concrete tiles over the dark; rings shake red-pen before they drop;
    bodies are tinted by seat, with a chalk "you" ring.
  - `input.ts`: arrows or WASD plus Space, Shift or J; on touch, a left-half stick and a
    right-half shove.
  - `title.href = '/party'`.
- **Server:**
  - `party.ts`: the shared `Party` base class (seats, host, emotes, strikes, rounds), taken out
    of `Match`.
  - `push-match.ts`: one shared sim stepped by wall-clock time. Inputs are stamped, and late
    ones apply at once and are reported back as `late`. A player silent for 30 frames lets go
    of the keys. Leaving counts as out and ranks last.
  - Room: mode `push` (8 seats, `maxClients` taken from the game). `lobby` gains `size`; `go`
    sends a `null` level and runner for Push.
  - Snapshots are now **time-based** (every 50ms). They used to be every third tick, which ran
    at about 14Hz on Windows' 15.6ms timer.
  - The Race and Sabotage snapshot now **carries** `truths` (every runner's frame, hash and
    gates) and `watch` (the runner's state). They used to be separate per-player messages:
    one socket write per player per beat, where there had been three.
  - Health line every 10s: rooms, clients, RSS, event-loop p99 and max.
- **Wallet (`platform-sdk/wallet.ts`):** earn-only coins and XP in one device slot
  (`jom:wallet:v1`) that every title shares, through `PlatformContext.wallet`.
  - Amounts are whole numbers, never negative, and capped at 1000 per event.
  - Earn rules: rage first clear +10 coins/+10 XP; daily clear +5/+5 once a day; any other
    clear +2 XP. Push win +10 coins/+15 XP; otherwise +5 XP.
- **Web:**
  - `/party` offers "Start a Push Party"; the lobby has 8 seats; Push HUD ("N of M still
    standing", the controls line, a countdown); results say Fell or Still standing, plus what
    was earned.
  - Seat chips are outlined and carry no digits (the ink-on-seat-colour digit was an
    unregistered pairing).
  - Home: Push Party in the games list, and a wallet badge in the masthead.
  - The Push Party emote bar sits at the bottom edge.
- **Tokens:** `lemon`, `cobalt`, `vermilion` (Okabe–Ito) for seats 5–7, with seat 8 in chalk;
  pairings registered (non-text on carbon, plus the ink swatch outline).
- **`RoomLink`** moved to `@jom/platform-sdk` (both titles use it); `GameTitle.href` added.
- **Load test (`pnpm --filter @jom/realtime load-test [rooms] [seconds] [workers]`):**
  - Runs the real server with `TRUST_PROXY=1`; each room arrives from its own
    `X-Forwarded-For` address.
  - Players run on worker threads, with a third of the rooms in each mode.
  - Attacks run under load.
  - Checks: snapshot rate and gaps, event-loop p99, Push arena lag, drops.

### Files changed

| File                                                                                                          | Change                                    |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `packages/game-push-party/**` (new)                                                                           | title #2: sim, client, renderer, input    |
| `apps/realtime/src/party.ts` (new), `push-match.ts` (new), `match.ts`, `party-room.ts`                        | shared lobby, Push rules, merged snapshot |
| `apps/realtime/src/limits.ts`, `server.ts`, `index.ts`                                                        | IP pinning, last-hop XFF, health line     |
| `apps/realtime/scripts/load-test.ts` (new), `test/push-match.test.ts` (new), `test/room.test.ts`              | load/abuse test, tests                    |
| `packages/platform-sdk/src/wallet.ts` (new), `context.ts`, `game.ts`, `index.ts`, test                        | wallet, `RoomLink`, `href`                |
| `packages/game-rage/src/game.ts`, `index.ts`, `party-game.ts`                                                 | wallet earns, `RoomLink`, truth in snap   |
| `packages/ui/src/tokens.ts`, `contrast.ts`, `theme.css`, generated files                                      | 3 seat colours, pairings                  |
| `apps/web/app/party/party-client.tsx`, `page.tsx`, `wallet-badge.tsx` (new), `next.config.ts`, `package.json` | Push UI, wallet badge                     |

### Database changes

None. The server-side wallet (`wallet` table, TECH_STACK.md §6) waits for Phase 2b.

### Automation changes

None. `@jom/game-push-party` joins the turbo typecheck, lint and test tasks.

### Testing

`pnpm verify` exit 0 with **335 tests**: engine 137, game-rage 104, realtime 24, ui 22, config
14, platform-sdk 13, web 9, game-push-party 7, clip 5.

- Push sim: deterministic over 20 seeds × 8 players × 3000 frames and integer-only; tests
  cover speed, shove and knock-back, falling out, the ring schedule and placings.
- Push match: 8 seats, the stale-input release, `late` feedback, strikes, a leaver ranked
  last, the time limit.
- Room: a Push round over WebSocket, plus the spoofed-IP cap test.
- Bundle: pages 169.9–185.5KB gzipped initial JS; one lazy Three.js chunk shared by both titles.

### Load test (this laptop: Ryzen 3 7320U, 4 cores and 8 threads, 6GB, Windows; players on the same machine)

| Rooms | Players | Snapshots/s | p95 gap | Loop p99 (steady) | Push lag p95 | Drops | Attacks |
| ----- | ------- | ----------- | ------- | ----------------- | ------------ | ----- | ------- |
| 60    | 320     | 19.9        | 70ms    | 38–53ms           | 0 frames     | 0     | 3/3     |
| 120   | 640     | 18.6        | 80ms    | 49–148ms          | 0 frames     | 0     | 3/3     |
| 200   | 1064    | 12.3        | 135ms   | 91–225ms          | 0 frames     | 0     | 3/3     |

- At 200 rooms the server holds every room with no drops, and the Push arena keeps time. It
  is short of 20Hz snapshots, and event-loop p99 goes over 50ms.
- A CPU profile put 44–52% of server time in `writev`, one socket write per player per
  snapshot.
- Folding truth and watch into the snapshot took Push lag at 200 rooms from 526 frames to
  under 12. The rest is the specified 20Hz rate on Windows syscalls, with the load generator
  sharing the cores.
- **The "200 rooms on one Railway instance" check is not verified.** Run the same script
  against Linux once the Railway service exists.

### Verification (built-in browser, `next start` + `node src/index.ts`)

- **Home:** Push Party is in the games list; the wallet reads "0 coins · 0 XP".
- **Push Party, two tabs:**
  - The host created the room; 8 seats listed; the second tab joined by the link.
  - After Start, the arena rendered: 10×10 tiles with the centre 2×2, the marigold body with
    its "you" ring, and the sky-blue player placed from snapshots.
  - The host moved and shoved; the edge ring shook red around 8s; the host walked off and
    fell.
  - Results: "Player 2: Still standing", "Player 1: Fell". The host saw "+5 XP", the guest
    "+10 coins · +15 XP".
  - "Play again" then Start began round 2 in both tabs.
- **Sabotage** after the snapshot merge: the saboteur saw the runner (from `watch`), and
  Arm 1 went out of range as the runner passed it.
- **Phone size (375×812):** the whole arena fits, the emote bar sits below it, the HUD above.
- **Not verified:**
  - Touch controls (the pane sends mouse events, which are ignored).
  - Real devices and networks, and reconnect.
  - Race after the snapshot merge in the browser (the room test covers truth in the snapshot).
  - A 3–8 player Push round.
  - Two tabs of one browser crediting the wallet at the same moment lost one update
    (last write wins). Separate devices don't share storage; the server wallet removes this.

### Final status

PARTIAL — Push Party, the wallet, the security fixes and the load/abuse test are done and
verified as above. Blocked:

- the friend list (needs accounts, Phase 2b);
- the Railway deploy and the 200-room check on it (needs the user's Railway account).

### Notes

- Wallet earn amounts are defaults picked here; PRD §9 still leaves "do coins buy anything" open.
- Seats 5–8 in 3D are colour-only (plus the "you" ring); names over heads would need text in
  WebGL.

---

## TASK-009 — Phase 5a — multiplayer rooms, local

- **Date:** 2026-09-26
- **Status:** PARTIAL

### User request

"continue" (Phase 5). **5a** is everything that runs without accounts or hosting (done here).
**5b**:

- Push Party (title #2).
- The cross-title wallet and friend list (need accounts).
- The Railway deploy and the 200-room load test.
- Drawn emote icons (words for now).

### Implementation

- **Engine gates:**
  - Any trap may carry `gate: 'leader' | 1..30`. A gated trap acts only while its bit is set
    in `SimState.gates`, which the server sets and the level never does.
  - `LEADER_GATE = 1`; slot k is `1 << k`.
  - `hashState` mixes `gates` only when non-zero, so solo hashes and fixtures are unchanged.
- **Multiplayer levels:**
  - `mp-race-01-front-runner`: leader-only saws and spikes.
  - `mp-sabotage-01-the-yard`: six numbered slots.
  - Both are solved with **every gate on** (the worst case).
  - Every level JSON import now has `with { type: 'json' }`, so plain Node can load them.
- **`apps/realtime` (new, `@jom/realtime`):** Colyseus 0.18, using `@colyseus/core` plus
  `ws-transport` only.
  - `Match` holds the rules and has no networking in it.
  - `PartyRoom` is the Colyseus room: Zod at the message boundary, 6-character codes.
  - Per-IP caps: 5 live rooms, 20 creations an hour, 1000 matchmake requests an hour (429).
  - Reconnect grace is 15s, and a room is disposed 10 minutes after it empties.
  - Input validation: clock window, density check and strikes (kick with code 4403).
  - Sabotage rules: 2 traps, a 2s cooldown, and a slot must be 160–900px ahead of the runner.
- **Client (`party-game.ts`, `mountParty`):**
  - Predicts locally with the same engine and sends change-only inputs plus a heartbeat.
  - Re-simulates when a late gate change arrives, and resyncs on a hash mismatch.
  - Draws the other players as tinted bodies and shows the runner to saboteurs.
- **Web `/party`:**
  - Create a race or sabotage room, or join by code; the URL is the invite link (copy or
    WhatsApp).
  - Lobby with four seat colours; the host starts the round.
  - In-round HUD: position or role, a countdown, "Arm N" buttons placed over the slots, a
    fixed 8-emote bar.
  - A results slip with "Play again".
- **Tokens:** seat colours `sky`, `jade`, `orchid` (Okabe–Ito), next to `marigold`.
- **CSP:** `connect-src` allows the realtime origin (`NEXT_PUBLIC_REALTIME_URL`, or
  `ws://localhost:2567` outside production).
- **Bundle check:** the env-name leak check matches whole identifiers only, so `PORT` does not
  match inside `TRANSPORT`.
- **pnpm:** `msgpackr-extract` (an optional native speed-up) is added to
  `ignoredBuiltDependencies`.

### Files changed

| File                                                                                        | Change                           |
| ------------------------------------------------------------------------------------------- | -------------------------------- |
| `packages/engine/src/level.ts`, `sim.ts`, `index.ts`, `test/gates.test.ts` (new)            | trap gates                       |
| `packages/game-rage/levels/mp-*.level.json` (2 new), `levels/index.ts`                      | MP levels, JSON import attrs     |
| `packages/game-rage/scripts/solver.ts`, `solve.ts`, `test/solutions.json`                   | solve with all gates on          |
| `packages/game-rage/src/party-game.ts` (new), `render.ts`, `index.ts`                       | networked client, others/markers |
| `packages/game-rage/test/multiplayer.test.ts` (new)                                         | MP solutions, gates on and off   |
| `apps/realtime/**` (new)                                                                    | server, match rules, tests       |
| `apps/web/app/party/*` (new), `page.tsx`, `security-headers.mjs`, `package.json`            | party UI, CSP, SDK               |
| `packages/ui/src/tokens.ts`, `contrast.ts`, `theme.css`, `tokens.css`, `CONTRAST.md`        | seat colours                     |
| `tooling/scripts/check-bundle.mjs`, `.env.example`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | leak regex, env names, deps      |

### Database changes

None.

### Automation changes

None. `@jom/realtime` joins the turbo typecheck, lint and test tasks automatically.

### Testing

`pnpm verify` exit 0 with **315 tests**: engine 137, game-rage 104, realtime 16, ui 18, config
14, platform-sdk 12, web 9, clip 5.

- The realtime room tests run a real WebSocket server on port 2568. They cover: join by code,
  start, inputs in and truth back, the kick for inputs from the future, and the 429 guard.
- `/party` ships 177.7KB of gzipped initial JS, and Three.js stays lazy.

### Verification (built-in browser: `next start`, plus `node src/index.ts`)

- **Race:**
  - The host created room RGS34P, and a second tab joined by the link.
  - Seats, you/host tags and "Waiting for one more player." were correct.
  - A guest emote showed "Player 2: GG" on the host.
  - After Start, the host's HUD read "Position 1 of 2 · in front, so the traps are for you".
  - The host moved with Right held, and the guest's sky-blue body appeared from snapshots.
- **Sabotage:**
  - The saboteur saw Arm 1 and Arm 2 enabled over the slot markers, and 3–6 off (out of range).
  - Arm 1 dropped traps left from 2 to 1, and the armed spikes appeared for both players.
  - The runner died there over several attempts; at the time limit the results slip read "The
    saboteurs win."
- **Found and fixed:** inputs still in flight when a round ended produced "not playing" toasts.
  Rejected inputs are now dropped silently, and only the strike limit kicks.
- **Found in review and fixed:** with `autoDispose = false`, a room whose creator never
  finished joining would never expire (Colyseus schedules nothing). The 10-minute empty timer
  now starts in `onCreate`. I read the Colyseus source to confirm the room clock is already
  running by then.
- **Not verified:**
  - Real devices, real network latency and packet loss.
  - Reconnect after a dropped connection.
  - A 3–4 player room, and "Play again" into round 2 (runner rotation has unit tests).
  - The load test.

### Final status

PARTIAL — Phase 5a is done and verified as above. Phase 5b needs Push Party, accounts (for the
wallet and friends) and a Railway deploy.

### Notes

- Clients never send positions or results; the server re-simulates every run from inputs.
- Inputs sent before the round starts or after it ends are dropped without a reply.

---

## TASK-008 — Phase 4a — chapters 2–3 + retention, offline

- **Date:** 2026-09-25
- **Status:** PARTIAL

### User request

"continue with phase 4". Split as before: **4a** runs without external accounts (done here);
**4b** needs the backend: leaderboards, the replay-verification worker and suspicion scoring,
taunts in the database with an admin editor, the age gate, data export/delete, the server-side
Daily Trap job with one scored run per user per day.

### Implementation

- **Engine (`packages/engine`)**
  - New traps:
    - `invert`, `grow` (player 48×64), `spring` (optionally hidden), `timer` (solids vanish).
    - `teleport` (a checkpoint that sends you home), `shuffle` (bindings rotate).
    - `clone` (a solid body replaying the previous attempt), `fakeClear` (freezes the player
      until any new input, 3s max, then the floor drops).
  - Solids gain `ice` (no grip) and `text` (render only).
  - `view` hints: `dark`, `spin`, `frameW`, `ghosts`.
  - The meta-trap kind `fakeError`.
  - Movement moved into a shared `moveBody`, used by the player and the clone.
  - New helpers:
    - `bindings`, `timeLeft`, `playerSize`, `attemptTracks` (ghost paths from an input log).
    - `verifyRun`: SECURITY §4.2–4.3 checks (frame cap, log shape, >20 changes/s sustained,
      85% floor, then a headless replay that must match outcome, frames and deaths).
- **Levels 11–30** (PRD §4.5–4.6), all solved with zero deaths. Level 17 is generated as an
  exact mirror of 16.
- **Solver** moved to `scripts/solver.ts` (importable):
  - 8 moves.
  - At most 6 beam slots per 16px cell.
  - A seeded random quarter of the beam.
  - A dedupe key covering the new state.
- **Renderer**:
  - Chapter tints (ch2 blue-grey, ch3 maroon).
  - Glassy ice; text printed on slab faces.
  - Springs, checkpoint flags; the fake door rendered as a door.
  - Growing player; the clone and ghosts in translucent chalk.
  - Darkness with a lamp on the player; spin (skipped with reduced motion); the lying camera
    frame.
- **Game**:
  - HUD gets `fake` (loading/complete/error), a countdown, current bindings, `daily`, `chapter`.
  - `nudge()`: a click on a fake screen counts as input.
  - Ghosts are recomputed from the input log after each death on ghost levels.
  - Best runs (input logs) are stored per level.
  - Daily mode.
- **Daily Trap**:
  - `dailyLevel(day)` is generated from the UTC date and solvable by construction.
  - The streak rules are `recordDailyClear` and `liveStreak`.
  - `pnpm --filter @jom/game-rage daily:check [days]` proves days clearable.
- **Web**:
  - `ClearedSlip` and `ErrorScreen` are frozen; the level 15 and 24 fakes render these same
    components.
  - Countdown top-right; a bindings line on the HUD; touch labels follow the bindings.
  - `?daily=1`; "Chapter 4 coming soon." on the last level.
  - The level board is grouped by chapter.
  - Home Daily Trap card with the streak; shared `useSave` hook.

### Files changed

| File                                                                                                            | Change                                       |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/engine/src/sim.ts`, `level.ts`, `index.ts`, `verify.ts` (new)                                         | mechanics, view hints, verification          |
| `packages/engine/scripts/fixture-format.ts`, `test/fixtures/*`, `test/traps3.test.ts` (new), `test/sim.test.ts` | fixture level 3, regenerated fixtures, tests |
| `packages/game-rage/levels/ch2-*`, `ch3-*` (20 new), `levels/index.ts`                                          | levels 11–30, `CHAPTERS`                     |
| `packages/game-rage/scripts/solver.ts` (new), `solve.ts`, `daily-check.ts` (new), `package.json`                | solver module, daily check                   |
| `packages/game-rage/src/game.ts`, `render.ts`, `progress.ts`, `index.ts`, `daily.ts` (new)                      | game, visuals, save, Daily Trap              |
| `packages/game-rage/test/*` (`daily.test.ts` new)                                                               | tests, solutions for 30 levels               |
| `apps/web/app/play/[title]/play-host.tsx`, `levels/*`, `page.tsx`, `daily-card.tsx` (new), `use-save.ts` (new)  | shell                                        |
| `apps/web/test/challenge.test.ts`                                                                               | level 11 is valid now                        |

### Testing

`pnpm verify` exit 0 with **289 tests**: engine 133, game-rage 101, web 9, config 14, ui 15,
platform-sdk 12, clip 5.

- Pages ship 169.9–184.7KB of gzipped initial JS; Three.js lazy (141.8KB).
- Fixtures regenerated on purpose (see memory.md): 50 runs, 113 deaths, 8 clears.
- `daily:check` equivalent: 60 consecutive days from 2026-09-25 are all clearable.

### Verification (built-in browser, `next start`)

- Home shows the Daily Trap card. The board lists all three chapters.
- Level 16 is dark apart from the player's lamp. Level 21's words are printed on the steps.
  Level 14's ledge is overhead. Level 19 counts down top-right. Level 20 rotates.
- Level 26: after 3s the HUD reads "← is Right · → is Left · Space is Jump".
- Level 24: the fake error screen is identical to the real one, and a key press dismisses it.
- Level 15: the fake "Level cleared" slip shows real-looking numbers. Clicking its Next level
  dropped the floor (death, attempt 2, same level). Left alone, it ended after 3s the same way.
- Level 28: attempt 1's path replays as a translucent ghost.
- `?daily=1` loads "Daily Trap · <UTC date>".
- **Not verified in the browser:**
  - Level 12 growing; Level 18 clone rendering; the Level 25 flag; Level 27's camera lie;
    the Level 14 spring reveal. Mechanics are covered by engine tests and solver replays.
  - A full Daily Trap clear updating the streak on screen; the streak logic has unit tests.
  - Real devices.

### Final status

PARTIAL — Phase 4a is done and verified as above. Phase 4b is blocked on the backend accounts.
The 3D_MODELING Phase 4 go/no-go needs live metrics.

### Notes

- Level 17 is authored as data (a mirrored copy of 16), not a runtime mirror flag.
- The spring fix changed physics only above terminal velocity against gravity, which nothing
  before it could reach.

---

## TASK-007 — Phase 3a — viral layer, offline

- **Date:** 2026-09-25
- **Status:** PARTIAL

### User request

"continue with phase 3". Split like Phase 2: **3a** is everything that works without external
accounts (done here). **3b** needs the Phase 2b backend: server-backed global death counters,
the friend's count coming back to the sharer, R2 clip upload, and rate limits.

### Implementation

- **Clips** (`packages/game-rage/src/clip.ts`):
  - During play the game keeps the run's input log; it does not buffer video.
  - On Share, the log is re-simulated headlessly up to 5 seconds before the last death (or
    the clear, if there was no death) and re-rendered into a 720×1280 card at 30fps.
  - Card layout per DESIGNING §3.6: brand and level line; "I died here N times" in
    red-pen; the clip; the death count in huge mono; the challenge URL. All burned in.
  - Recorded with MediaRecorder, MP4 first, WebM otherwise.
  - Falls back to a PNG still card (the frame before the death) when there's no recorder,
    only 2 CPU cores, or the clip is over 15MB.
- **`packages/clip`** (new, title-agnostic):
  - `pickVideoType`, `recordCanvas`, `MAX_CLIP_BYTES`.
  - `shareClip`: the native share sheet with the file, otherwise save the file.
  - `saveFile`, `whatsappUrl`.
- **Renderer:** `createView(container, fixed?)` renders at a fixed pixel size (for clips);
  `render(..., showPlayer)` lets the death freeze-frame show debris without the player.
- **Challenge links:**
  - `/c/rage-<level>-<deaths>`, stateless, deaths capped at 9999.
  - Validated with Zod in `app/c/[code]/challenge.ts`.
  - Landing page with a "Play level N" button → `/play/rage?level=N&vs=deaths`.
  - `opengraph-image.tsx`: 1200×630 card with the friend's count, using WOFF fonts in
    `apps/web/assets/fonts` (copied by `pnpm --filter @jom/web fonts`).
- **Challenge play:**
  - `GameOptions.challenge` opens the level even when locked.
  - Clearing a locked challenge level unlocks nothing.
  - The result slip compares your deaths with the friend's.
- **Rage meter:** `rageScore(presses, frames)` → 0–99 plus one printed line, shown as a
  "Rage score" row and line on the result slip. Presses are new button-press edges.
- **Share UI:**
  - Result slip: marigold "Share clip" after Next level.
  - Paused slip: "Share last death" after at least one death.
  - Fallback after a saved file or a failure: "Send on WhatsApp" and "Copy link".
  - Share state is keyed to `HudState.run`, which is new.
- **Telemetry:** `clip_made {level, format, ms}`, and
  `share {level, channel: native|download|whatsapp|copy, taunt}`.

### Files changed

| File                                                                                                                             | Change                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `packages/clip/*` (new)                                                                                                          | recorder + share helpers + tests       |
| `packages/game-rage/src/clip.ts`, `rage.ts` (new); `game.ts`, `render.ts`, `index.ts`                                            | clips, rage meter, challenge, `run`    |
| `packages/game-rage/test/run-replay.test.ts` (new), `package.json`                                                               | replay + rage tests; `@jom/clip` dep   |
| `apps/web/app/c/path.ts`, `c/[code]/challenge.ts`, `page.tsx`, `opengraph-image.tsx` (new)                                       | challenge links + OG image             |
| `apps/web/app/play/[title]/play-host.tsx`                                                                                        | share UI, `?vs=`, rage/challenge lines |
| `apps/web/test/challenge.test.ts` (new), `package.json`, `next.config.ts`, `scripts/copy-fonts.mjs`, `assets/fonts/*.woff` (new) | tests; zod 4.6.5; OG fonts             |

### Testing

`pnpm verify` exit 0 with **222 tests**: engine 116, game-rage 51, platform-sdk 12, clip 5,
config 14, ui 15, web 9.

- Pages ship 169.9–179.5KB of gzipped initial JS.
- Three.js stays in a lazy chunk (139.9KB).
- The challenge routes are dynamic (ƒ).

### Verification (built-in browser, `next start`)

- `/c/rage-7-23`:
  - The page reads "A friend died 23 times on level 7." with a "Play level 7" button.
  - `og:image`/`twitter:image` point at the OG route, and the image renders.
  - Bad codes (`rage-99-1`, `rage-7-023`, a bad OG code) return 404.
- Challenge play on a fresh save (only level 1 unlocked): level 7 opened. The result slip
  showed Rage score 0, "Calm. Suspiciously calm." and "Your friend died 23 times here. You
  died once. Tell them."
- **Share clip** (with the native sheet disabled and the download intercepted):
  - Produced `just-one-more.mp4`: video/mp4, 720×1280, 244KB.
  - The fallback showed "Send on WhatsApp" with the correct link text, and "Copy link".
  - Canvas snapshots taken during the recording show the walk to the door, then the death
    with debris.
  - The PNG still card (MediaRecorder removed) shows the exact frame before the fake door
    killed the player.
- After a death, the Paused slip shows "Share last death".
- Bug found and fixed: share state leaked into the next run's slip after Replay (same
  level/attempt key). It's now keyed by run.
- **Not verified:**
  - Real-time pacing of the video. The pane was hidden, so frames came only from forced
    screenshots and the file ran 12s instead of about 5.7s.
  - The native share sheet on a real Android or iOS phone.
  - WhatsApp opening from `wa.me`.
  - Encode time on a low-end phone.

### Final status

PARTIAL — Phase 3a is done and verified as above. Phase 3b (global death counters, count
return, R2 upload, clip and OG rate limits, takedown route) is blocked on the Phase 2b
backend accounts.

### Notes

- Skipped on purpose:
  - A Web Worker encoder. MediaRecorder already encodes off the main thread, and the game
    is paused while a clip is made.
  - Cross-origin isolation, which is only needed for SharedArrayBuffer encoders.
  - Blender marketing stills (3D_MODELING Phase 3), superseded by the in-game 3D renderer.
- `metadataBase` is not set: `og:image` URLs are absolute to the serving host (localhost
  locally; Vercel supplies its URL). Set it once the custom domain exists.

---

## TASK-006 — Phase 2a — chapter 1 complete, offline

- **Date:** 2026-09-24
- **Status:** PARTIAL

### User request

"continue with phase 2". Phase 2 was split: **2a** is everything that runs without external
accounts (done here); **2b** is the backend (Supabase, Upstash, PostHog), which needs accounts
only the user can create.

### Implementation

- Engine traps:
  - Spikes can erupt on a jump or on a timer.
  - `crusher` (a lowering press) and `coin` (greed).
  - `fakeGoal` doors: several `goals`, and the first one in scope is real.
  - `gravityFlip`.
  - Attempt scoping gains `parity` (odd/even attempts).
  - New death causes: Crush, Greed, FakeDoor.
  - `metaTrap {kind: 'fakeLoading', frames ≤ 180}`.
- Levels 4–10:
  - 4 Ceiling, 5 Reverse Rules, 6 Greed, 7 Two Doors.
  - 8 Loading: the fake loading screen.
  - 9 Upside Down, 10 All At Once.
- Beam-search solver `game-rage/scripts/solve.ts` writes the zero-death clears in
  `solutions.json`. All 10 levels are solved.
- Plugin contract:
  - `GameTitle` and `PlatformContext` in `@jom/platform-sdk`.
  - `createDeviceContext` (localStorage) and `recordRealError`.
  - The title reads and writes progress only through the context.
- Meta-trap gate `metaTrapAllowed`:
  - Blocked in the first session and within 10 minutes of a real error.
  - Only on attempts 1–2.
  - Any input dismisses it, and it lasts at most 3 seconds.
  - The fake screen is the real `LoadingScreen` component.
- Unlock gating: a locked `?level=N` starts at the highest unlocked level.
- Web:
  - `/play/rage/levels` notice board: deaths per level, locked rows struck through.
  - "All levels" link from Paused.
  - The home page lists the titles, so it's ready for more than one.
- Renderer: builders for the new traps (erupting spikes, crusher with teeth, spinning coin,
  primary and alt doors), the player turns over when gravity flips, and levels with a visible
  ceiling are framed at full height.
- Taunts: 31 lines, with new crush, greed and door tags.

### Files changed

| File                                                                                        | Change                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `packages/engine/src/level.ts`, `sim.ts`, `index.ts`                                        | new traps, goals, gravity, meta-trap field |
| `packages/engine/scripts/fixture-format.ts`, `test/fixtures/*`, `test/traps2.test.ts` (new) | third fixture level, fixtures regenerated  |
| `packages/game-rage/levels/ch1-l04…l10*.level.json` (new), `levels/index.ts`                | levels 4–10                                |
| `packages/game-rage/scripts/solve.ts` (new), `package.json`, `tsconfig.json`                | solver, `./levels` export                  |
| `packages/game-rage/src/game.ts`, `render.ts`, `taunts.ts`, `progress.ts`, `index.ts`       | context, meta-trap, new visuals            |
| `packages/game-rage/src/meta-trap.ts` (new), `test/*`                                       | gate + tests                               |
| `packages/platform-sdk/src/game.ts`, `context.ts` (new), `index.ts`, `test/context.test.ts` | plugin contract                            |
| `apps/web/app/page.tsx`, `play/[title]/play-host.tsx`, `play/[title]/levels/*` (new)        | home, host, level board                    |

### Database changes

None (Phase 2b).

### Testing

`pnpm verify` exit 0 with **211 tests**: engine 116, game-rage 49, platform-sdk 12, config 14,
ui 15, web 5.

- Pages ship 169.5–178.8KB of gzipped initial JS.
- Three.js only in its lazy chunk (~138KB).
- Fixtures were regenerated on purpose: all 50 old runs gave identical snapshots before the
  state hash changed. Fixtures now: 50 runs, 111 deaths, 17 clears.

### Verification (built-in browser, `next start`)

- Level board: lifetime deaths shown, locked levels struck through and not linked.
- Level 8 (session 4): the fake loading screen covers the live game, the timed spikes erupt at
  spawn, and a key press dismisses the screen.
- Level 7: the near door shows (the real door is off-screen right).
- Level 4: the toothed ceiling is visible over the gap.
- Level 9: the ceiling platforms and the upside-down door are in frame.
- Level 2: framing is unchanged.
- **Not verified:**
  - Every level cleared by hand in the browser. Clears are covered by the solver replays.
  - Real phone touch, Android frame rate, sound.

### Final status

PARTIAL — Phase 2a is done and verified. Phase 2b (accounts, server progress, RLS, rate
limits, PostHog, live global death counter) is blocked on accounts only the user can create.

### Notes

- The save key moved from `jom:progress:v1` to `jom:save:rage:v1`. Earlier local progress is
  not migrated, since nothing has been released yet.
- Skipped: the dot-matrix animation on the result slip. It was deferred as polish.

---

## TASK-005 — Phase 1 core loop, in 3D

- **Date:** 2026-09-24
- **Status:** PARTIAL

### User request

"it is too much 2d I want to it make it more relaistic more user freidnly and also 3d", then
"cotinue with phase 1". Answers to the follow-up questions: **3D look, 2D movement** and
**stylised realistic**.

### Implementation

- Engine: level file schema 1 with `parseLevel` (path-precise `LevelError`) and `compileLevel`.
  Traps: collapse, spike, saw and goalShift, each scoped to an attempt range. Goal and clear,
  attempt counter, death causes, 3px forgiving hazard hitboxes. Integer-only, deterministic.
- Fixtures regenerated on purpose (the level shape and hash changed). They now cover the
  sandbox plus an all-traps level: 50 runs, 103 deaths, 11 clears.
- Levels 1–3 authored per PRD §4.4 (Welcome, Trust, False Trust), each with a zero-death
  recorded clear in `test/solutions.json`.
- Renderer: Phaser removed, Three.js 0.186 added (3D look, 2D movement).
  - Lighting: lit grainy concrete, PCF soft shadows, studio environment reflections.
  - Hazards: metal spikes, a spinning saw that stays hidden until triggered, a glowing door.
  - Character: squash and stretch, lean and facing, death debris, camera shake (skipped
    with reduced motion).
  - Camera follows the player on any screen shape.
- Game controller: pause (Esc/P, auto-pause on hidden tab), restart (R), next (Enter).
  Synthesised sound (no audio files). 25-line English taunt engine. Local progress and
  lifetime deaths.
- Web: HUD (level, attempt, mute, pause); first-run key hint; touch zone labels; paper
  Paused / Level cleared slips; `?level=N`; holding page copy updated.
- Bundle check now guards Three.js out of initial JS.

### Files changed

| File                                                                                                              | Change                              |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `packages/engine/src/level.ts`, `sim.ts`, `index.ts`                                                              | level format, traps, goal, attempts |
| `packages/engine/test/traps.test.ts`, `level.test.ts` (new), others updated                                       | tests                               |
| `packages/engine/scripts/*`, `test/fixtures/determinism-runs.json`                                                | fixtures v2 across two levels       |
| `packages/game-rage/levels/*` (new)                                                                               | 3 level files + loader              |
| `packages/game-rage/src/game.ts`, `render.ts`, `taunts.ts`, `audio.ts`, `progress.ts` (new), `index.ts`           | 3D game                             |
| `packages/game-rage/src/sandbox-game.ts`                                                                          | deleted (Phaser)                    |
| `packages/game-rage/test/levels.test.ts`, `taunts.test.ts`, `solutions.json` (new)                                | level solvability + taunt tests     |
| `apps/web/app/play/[title]/play-host.tsx`, `page.tsx`, `app/page.tsx`                                             | HUD, menus, copy                    |
| `tooling/scripts/check-bundle.mjs`, `packages/ui/src/tokens.ts`                                                   | Three.js marker; comment            |
| `CLAUDE.md`, `init.md`, `logic.md`, `README.md`, `docs/TECH_STACK.md`, `docs/DESIGNING.md`, `docs/3D_MODELING.md` | architecture change noted           |

### Testing

`pnpm verify` exit 0: format and colour checks, typecheck, lint, **176 tests** (engine 107,
game-rage 26, config 14, ui 15, platform-sdk 9, web 5), build, bundle check: pages 169.5–175.6KB
gzipped initial JS; Three.js only in a lazy chunk of 140.8KB; all client JS 320.5KB (was 490.1KB
with Phaser). `replay:headless` 50/50 frame-exact.

### Verification (built-in browser, `next start`)

- Level 1: running right collapses step 3; the fall kills; respawn on attempt 2 with the
  spikes shown; the taunt appeared ("Bold. Wrong, but bold."); HUD "Attempt 2"; progress and
  telemetry (`level_start`, `level_death` cause 1) written to localStorage.
- Level 3 via `?level=3`: jumping the gap works and the camera follows; the saw appeared and
  killed the player mid-run. A saw shadow that gave the trap away was found and fixed.
- Esc opens the Paused slip. Portrait 375×812: after two camera/fog fixes the floor sits clear
  of the touch labels and colours read correctly.
- **Not verified:** the Level cleared slip visually (clearing is covered by the solution
  replays, not by a browser run); real touch input on a phone; frame rate on a mid-range
  Android; sound output.

### Final status

PARTIAL — all Phase 1 build items are done and verified in code and browser, except the
10-person playtest (PRD §6) and enforcing the CSP with nonces (SECURITY §11).

### Notes

- CSP report-only review done: the only violations are Next.js inline hydration scripts.
  Enforcing needs per-request nonces, which makes every page dynamic. That trade-off is the
  user's call.
- Skipped on purpose: the `fakeGoal` trap (no Phase 1 level uses it; Level 7 will), a JSON
  Schema file for editor autocomplete (`parseLevel` is the validator), and an fps readout.

---

## TASK-004 — English spec docs + rename to Just One More

- **Date:** 2026-09-23
- **Status:** COMPLETED

### User request

"yes rewrite the docs in english too use ponytail too", then "change all the hindi to english
even name change everything".

### Implementation

- `docs/*.md`: every Hindi or Hinglish line translated in place; the rest of each doc is untouched.
  - Chapter names: Welcome / Now It Gets Fun / Now It's Personal.
  - Level names: Welcome, Trust, False Trust, Ceiling, Reverse Rules, Greed, Two Doors,
    Loading, Upside Down, All At Once.
  - Also translated: taunt seeds, home mockup, button labels, the "rage score" meter, and the
    share-card line.
  - Titles: the song-chain game replaces Antakshari; the 3D mode is now "Higher and Higher".
  - Devanagari/Hinglish font and language notes removed.
- Name: "Bas Ek Aur" → "Just One More" everywhere. Root package is now `just-one-more`, the
  scope is `@bas/*` → `@jom/*`, and ESLint rules are `bas/*` → `jom/*`.
  - `eslint-plugin-bas.mjs` → `eslint-plugin-jom.mjs` (and its test).
  - The telemetry key is now `jom:telemetry:v1`.
- Done by a one-shot scripted find/replace (dry-run reviewed first), then `pnpm install` to relink.
- Kept on purpose: SECURITY.md's handle denylist still covers Hindi slurs. It is a safety
  control for an Indian audience, not copy.

### Testing

`pnpm verify` exit 0: format, hex check, typecheck, lint, 147 tests, build, bundle check.

### Final status

COMPLETED. Earlier task entries keep their original wording as history.

---

## TASK-003 — Switch all copy to English

- **Date:** 2026-09-23
- **Status:** COMPLETED

### User request

"Make in english dont make in hindi Make the sentences and everything in english"

### Analysis

Grepped the repo (excluding `docs/` and `node_modules`) for Hinglish words. Found player-facing
strings on the holding page, the play host, the page metadata, the specimen sample, and the
sandbox HUD, plus Hinglish references in project docs and comments.

### Plan

Replace every Hinglish string with plain English and keep the deadpan, sentence-case tone.
Record the decision in `CLAUDE.md` as the project rule. Leave the spec documents in `docs/`
alone unless the user asks, and keep the brand name (both reversed in TASK-004).

### Implementation

| Before                                       | After                                               |
| -------------------------------------------- | --------------------------------------------------- |
| Ek game jo tumse jhooth bolta hai.           | A game that lies to you.                            |
| Abhi ban raha hai… (sandbox intro)           | It is still being built. Until then, warm up…       |
| Sandbox khelo                                | Play the sandbox                                    |
| Hinglish mein. Mobile pe bhi.                | Works on your phone too.                            |
| Load ho raha hai                             | Loading                                             |
| Game load nahi hua. Page reload karke dekho. | The game didn’t load. Reload the page to try again. |
| Wapas jao                                    | Back to home                                        |
| koshish N (HUD)                              | attempt N                                           |
| Is level pe sab marte hain (specimen sample) | Everyone dies on this level                         |
| Meta description (Hinglish)                  | A game that lies to you, and makes you laugh…       |

### Files changed

| File                                            | Change                                  |
| ----------------------------------------------- | --------------------------------------- |
| `apps/web/app/page.tsx`                         | Holding page copy                       |
| `apps/web/app/layout.tsx`                       | Meta description                        |
| `apps/web/app/play/[title]/play-host.tsx`       | Loading, error, and back-link text      |
| `apps/web/app/specimen/page.tsx`                | Type sample                             |
| `packages/game-rage/src/sandbox-game.ts`        | HUD label                               |
| `packages/ui/src/contrast.ts`, `CONTRAST.md`    | Button label in the pairing description |
| `apps/web/scripts/copy-fonts.mjs`, `README.md`  | Comment and tagline                     |
| `CLAUDE.md`, `init.md`, `logic.md`, `memory.md` | English-only rule and updated strings   |

### Database changes

None.

### Automation changes

None.

### Testing

`pnpm verify` — see the memory.md entry for TASK-003.

### Verification

Re-grepped for Hinglish words outside `docs/`. The only match left is the brand name.

### Final status

COMPLETED.

### Notes

The five spec documents in `docs/` still describe a Hinglish voice and contain Hinglish
examples (taunts, level names, mockups). They were not edited. Ask the user whether to rewrite them.

---

## TASK-002 — Phase 0 foundation

- **Date:** 2026-09-23
- **Status:** PARTIAL

### User request

"yes, start Phase 0" — after reviewing the five spec documents from `files1.zip`.

### Analysis

- Working directory was empty and not a git repo. Node 24.13.0, git 2.51, gh 2.96 present;
  pnpm and gitleaks absent.
- Phase 0 scope collected from PRD §6, TECH_STACK §8, SECURITY §11, DESIGNING §8, 3D_MODELING §8.
- Version constraints found: typescript-eslint requires TS < 6.1; eslint-config-next's plugins
  do not declare ESLint 10; Next 16 App Router requires React 19.

### Plan

1. Monorepo (pnpm workspaces + Turborepo), shared config, Prettier, Husky + lint-staged.
2. Deterministic engine + 50-run determinism harness + headless replay.
3. Phaser sandbox (Phaser renders, engine simulates) + keyboard/touch → bitmask input.
4. Telemetry bus (local-first, vendor-agnostic).
5. Design tokens, Tailwind theme, contrast audit, fonts, specimen route.
6. Next.js shell: holding page, play host, security headers, ESLint server/client rules.
7. 3D preparation: reserved package, lazy boundary, unit scale, bundle isolation check.
8. CI: ci.yml, security.yml (gitleaks), dependabot, bundle + hex checks.
9. Verify locally, then document.

### Implementation

All nine plan steps done locally. Deployment, domain, and the GitHub remote were not done —
they need the user's accounts.

### Files changed

| File                                                                                             | Change                                                                                            |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `pnpm-lock.yaml`                            | created — workspace root                                                                          |
| `.gitignore`, `.gitattributes`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `.nvmrc` | created                                                                                           |
| `.husky/pre-commit`                                                                              | created — lint-staged (Prettier)                                                                  |
| `.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/dependabot.yml`           | created                                                                                           |
| `.claude/launch.json`                                                                            | created — preview server config (`next start`)                                                    |
| `packages/config/*`                                                                              | created — tsconfig base, ESLint base, `eslint-plugin-jom.mjs` + tests                             |
| `packages/engine/*`                                                                              | created — src (fixed, prng, aabb, input, loop, level, sim), tests, fixtures, scripts              |
| `packages/game-rage/*`                                                                           | created — `mountSandbox`, `sandbox-game.ts`, input (keyboard, touch, source), tests               |
| `packages/platform-sdk/*`                                                                        | created — telemetry bus, `GameHandle`, tests                                                      |
| `packages/ui/*`                                                                                  | created — tokens, contrast, render, generated `tokens.css` + `CONTRAST.md`, `theme.css`, tests    |
| `packages/game-3d/*`                                                                             | created — lazy boundary, unit scale, README                                                       |
| `apps/web/*`                                                                                     | created — Next app, routes, globals.css, security headers + tests, fonts script, `public/fonts/*` |
| `tooling/scripts/check-bundle.mjs`, `tooling/scripts/check-no-hex.mjs`                           | created                                                                                           |
| `README.md`                                                                                      | created — links the threat model (SECURITY.md)                                                    |

### Database changes

None.

### Automation changes

GitHub Actions workflows and Dependabot config added (not yet run — no remote).

### Testing

`pnpm verify` (exit 0):

```
All matched files use Prettier code style!
No hardcoded colours outside packages/ui tokens.
@jom/ui            Tests 15 passed
@jom/platform-sdk  Tests  9 passed
@jom/game-rage     Tests 14 passed
@jom/engine        Tests 90 passed   (includes 50 frame-exact fixture replays)
@jom/web           Tests  5 passed
@jom/config        Tests 14 passed
  ok   index.html          173.0KB  (8 scripts)
  ok   play\rage.html      174.0KB  (8 scripts)
  ok   specimen.html       169.5KB  (7 scripts)
All client JS: 490.1KB gzipped across 14 files
Phaser lazy chunk(s): static\chunks\2y6eax9o29mmg.js 311.9KB
Bundle check passed.
```

`pnpm --filter @jom/engine replay:headless` → `50/50 runs frame-exact (34.3ms)`.
Hex-check negative test: a probe file with `'#ff0000'`, a template `#abc` and CSS `#fff` was
rejected; private fields `#dead`/`#face` were not flagged.

### Verification

- Built-in browser against `next start`: all security headers present, no `x-powered-by`;
  Khand + Plex fonts load from `/fonts`; body/button use token colours; button 54px tall.
- `/play/rage`: one WebGL canvas (960×540 backing, fit-scaled), no loading/error text, one
  `sandbox_start` telemetry event queued locally, no console errors.
- **Not verified:** live movement/60fps in a visible browser (pane was hidden → rAF paused);
  real mid-range Android device; GitHub Actions runs; gitleaks.

### Final status

PARTIAL — all local Phase 0 work is done and verified; public deploy, custom domain, GitHub
remote/CI run, and a visible-browser/device play check need the user.

### Notes

Requires manual action:

1. Create the GitHub repo and push (then CI + gitleaks run for the first time).
2. Connect the repo to Vercel (root `apps/web`, pnpm) for preview deploys; add the custom domain.
3. Play `/play/rage?debug=1` on a desktop and a mid-range Android phone; confirm movement,
   ~60fps, touch zones.

---

## TASK-001 — Documentation system bootstrap

- **Date:** 2026-09-23
- **Status:** COMPLETED

### User request

Part of "yes, start Phase 0" — the global operating rules require the repo documentation system.

### Analysis

Empty directory; no existing docs, no `.env`, not a git repo.

### Plan

1. `git init -b main`. 2. Copy specs to `docs/`. 3. Create CLAUDE.md, init.md, memory.md,
   tasks.md, logic.md, `.env.example` with verified facts only.

### Implementation

Done as planned. `.env` not created (user-owned).

### Files changed

| File                                                                                                | Change                                     |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `docs/PRD.md`, `docs/TECH_STACK.md`, `docs/SECURITY.md`, `docs/DESIGNING.md`, `docs/3D_MODELING.md` | copied from `files1.zip` unchanged         |
| `CLAUDE.md`, `init.md`, `memory.md`, `tasks.md`, `logic.md`                                         | created                                    |
| `.env.example`                                                                                      | created — no keys (no code reads env vars) |

### Database changes

None.

### Automation changes

None.

### Testing

N/A (documentation).

### Verification

No secret values in any file; `.gitignore` covers `.env` / `.env.*`.

### Final status

COMPLETED.

### Notes

Supabase project identity: none exists yet — recorded in `init.md`.
