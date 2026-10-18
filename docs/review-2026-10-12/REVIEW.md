# Just One More: full product review (UI to gameplay)

Reviewed 12 October 2026 at commit `18b760d`. I read the code, the specs (`docs/`), `memory.md` and
`tasks.md`, then ran the production build and played level 1 in the browser at 375 × 812,
1280 × 720 and 1440 × 900. Screenshots are in this folder. The design lens is the
**Design Library Pro** skill: its process, its pre-ship checklist (`anti-patterns.md`) and its
game-related references (DL-069 CrazyGames, DL-016 AMIX games, DL-070 Shiv Shakti, DL-032 Igloo,
DL-001 Smooothy).

> **Not verified in this pass:** a real phone, Push Party rounds, multiplayer with real latency,
> Lighthouse, frame times on mid-range Android, and levels past 1 in the browser. The 40 levels'
> clearability comes from the existing solver and fairness tooling, not from a new human playthrough.

---

## 1. Verdict

The engineering is unusually strong for a game at this stage. It has a deterministic sim, 40
solver-proven levels, replay-based clips, a server-authoritative multiplayer mode and real
security work. The **experience layer has not caught up**: the moment of death, the in-level
framing, progression and audio are where players will decide whether to press "just one more".
The concept ("a game that lies to you", told as an exam result sheet) is distinctive, but the
product only half delivers it.

| Area                          | Score | One-line reason                                                                      |
| ----------------------------- | ----: | ------------------------------------------------------------------------------------ |
| Engineering foundation        |   9   | Determinism, tests, solver, fairness audit, security posture                         |
| Level content                 |  7.5  | 40 levels with distinct ideas and 3 hints each; ch. 4 is long and has no checkpoints |
| Game feel (input, juice)      |  5.5  | No coyote time or jump buffer; a held key re-kills you; death is under-played        |
| In-level visuals and camera   |  5.5  | Good materials, but about 60% empty sky; tiny runner; no goal visible at spawn       |
| Home page                     |   7   | A clear idea, strong type; promises a different-looking game                         |
| Levels and Party pages        |   5   | Plain, different visual system; the levels page has no way home                      |
| Retention and meta            |  4.5  | Coins with nothing to spend; best runs saved but never shown; hints forgotten        |
| Audio                         |  3.5  | Four synth blips, no music, no landing/UI sounds                                     |
| Accessibility                 |   7   | Focus, 44px targets, reduced motion, aria-live; no remapping, no touch feedback      |

These scores are my judgement, not measurements.

---

## 2. What to keep (do not "improve" these away)

- **The concept.** The "Result Declared" exam-sheet world (DESIGNING.md §1) is specific to the
  audience and gives taunts a natural home. The home copy ("A game that lies to you.") lands.
- **Instant respawn.** A hard cut with no animation, exactly per spec. Keep it.
- **Taunts.** Context-tagged, never the same twice in a row, mocking the play and not the player.
- **Help pacing.** A hint after 3 deaths and "Watch how" after 6, using a solver recording chosen to be
  forgiving. This is a better safety net than most commercial rage games have.
- **Clips re-rendered from the input log.** This is cheap, honest and shareable, and it can also make
  your marketing loops (see G6).
- **Meta-trap discipline.** The frozen `LoadingScreen` / `ClearedSlip` / `ErrorScreen` components shared with
  the fakes on levels 8, 15 and 24.

---

## 3. Scopes for improvement

Priority: **P0** = do first (cheap and high impact, or broken), **P1** = next, **P2** = later.
Effort: **S** < half a day, **M** 1–3 days, **L** > 3 days or touches determinism/fixtures.
**Sim?** marks changes that alter `packages/engine` behaviour. Those require regenerating fixtures,
re-running `solve` and `fairness`, and a `memory.md` note (CLAUDE.md rules).

### A. Gameplay feel

| #  | Finding (evidence)                                                                                                                                                                                                                                                                                      | Scope                                                                                                                                                                                                                                                                                                               | P  | Effort | Sim? |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -- | ------ | ---- |
| A1 | **No coyote time and no jump buffer.** A jump fires only on the press edge while `onGround` (`packages/engine/src/sim.ts:340`). Pressing jump 1–2 frames late off a ledge, or 1–2 frames early before landing, does nothing. Players read that as "the game ate my input", which feels unfair, not funny. | Add ~5 frames of coyote time and ~5 frames of jump buffering as one deliberate physics change. Then regenerate fixtures, re-solve all 40 levels and their attempt layouts, run `fairness` and `daily:check`, and re-tune traps that get easier. **The rule:** the trap should be the joke, never the controls. | P1 | L      | Yes  |
| A2 | **A held key kills you repeatedly.** Holding → on level 1 produced 18 attempts in a few seconds (screenshot 07). This inflates the death count, the attempt number, the share text ("I died 18 times") and the rage score.                                                                                  | After a death, ignore any input still held from before the respawn until it is released. Do this in `game.ts` before `recorder.record`, so the log and replays stay exact. Respawn stays instant; only the held key is discarded.                                                                                   | P0 | S      | No   |
| A3 | **The death moment is under-played.** It has debris and a 0.12s shake (`render.ts:942`). The spec's **red-pen slash** (DESIGNING.md §2.3, §3.4) is not implemented.                                                                                                                                      | Add a 120ms red-pen slash across the screen (a DOM/CSS overlay, honouring reduced motion). This is the product's signature beat.                                                                                                                                                                                    | P0 | S      | No   |
| A4 | **Deaths leave no trace.** Ghosts only appear on levels with `view.ghosts` (`game.ts:233`).                                                                                                                                                                                                            | **"Every death leaves a mark":** draw a small red-pen ✗ at each previous death spot this session, like a teacher's corrections on the level. It shows where the troll is, it is funny at 30 marks, and it makes a great share frame. Render-only.                                                                     | P0 | M      | No   |
| A5 | **The long chapter 4 levels have no checkpoints.** They run 4,700–8,000px and up to about 40s (memory.md, TASK-014). Dying at second 35 replays 35 seconds; that is frustration, not comedy.                                                                                                           | Add a real checkpoint mechanic, off by default, used only in ch. 4. Note that level 25's *fake* checkpoint gets funnier once real ones exist. The solver must learn it.                                                                                                                                              | P1 | L      | Yes  |
| A6 | **Best runs are stored but never used.** `progress.best` keeps the fastest input log per level (`progress.ts`); nothing shows it.                                                                                                                                                                       | (a) Show the best time on the level board and the slip. (b) A "race your best" ghost on replay, since `setGhosts` and `attemptTracks` already exist. It is almost free retention.                                                                                                                                   | P1 | M      | No   |
| A7 | **Hints are forgotten on reload** (`play-host.tsx:78`: "in memory, so a reload starts at hint 1").                                                                                                                                                                                                    | Persist `hintsRead` per level in the save.                                                                                                                                                                                                                                                                          | P1 | S      | No   |
| A8 | **The controls hint vanishes after the first death** (`firstRun` = level 1, attempt 1, `play-host.tsx:374`), and level 1 kills in seconds.                                                                                                                                                              | Keep the hint until the player has jumped once and moved 200px, whatever the attempt.                                                                                                                                                                                                                               | P0 | S      | No   |

### B. In-level camera, readability and world

| #  | Finding                                                                                                                                                                                                                                                                       | Scope                                                                                                                                                                                                                                                                                                                                              | P  | Effort |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -- | ------ |
| B1 | **The frame is mostly empty sky.** At 1280 × 720 about 60% of the screen is flat navy and the runner is about 40px tall (screenshot 05). In portrait the course is a strip at the bottom, as the CrazyGames review also noted (screenshot 04).                                    | Re-frame: less camera height and tilt, the play plane higher, and a tighter zoom in portrait (`render.ts:505` uses a 6-unit view width; try 4.5). Measure the runner's height as a share of the screen at 375/768/1440 and target ≥ 8%.                                                                                                            |  P0 | M      |
| B2 | **No goal visible at spawn and no sense of length.** Level 1 opens on floor and sky only.                                                                                                                                                                                       | (a) A 0.8s camera pan from spawn to door on attempt 1 only, skipped by any input. It must respect the `view.frameW` lie on level 27. (b) A thin progress ruler at the top styled as an exam-sheet scale, with the best-run tick and death ticks on it.                                                                                               |  P1 | M      |
| B3 | **There is no world behind the course.** A flat navy sky with fog sells "lit concrete" but not a place.                                                                                                                                                                         | A cheap backdrop per chapter: 2–3 parallax silhouette layers built from primitives and tokens (exam hall, notice boards, ceiling fans, a stamped "Result Declared" banner). This follows the skill's "cheapest 3D that gives the look". Chapter 4 "After The End" can be the empty hall after the exam.                                              |  P1 | M      |
| B4 | **The home art and the game art don't match.** The home scene shows a lime square and an outline door (screenshot 01). The game shows a jointed human on concrete slabs (screenshot 05). The home promises a different game.                                                     | Replace the CSS scene with a **pre-rendered loop of the real game**: export a short WebM plus poster from a recorded solution through the existing `makeClip` pipeline, offline. Three.js stays out of the initial JS (check-bundle rule). Keep the CSS scene as the reduced-motion and no-video fallback.                                         |  P1 | M      |
| B5 | Quality is fixed: DPR up to 2, a 1024 PCF shadow map and antialiasing (`render.ts:280, 312`). The target is a mid-range Android on 4G.                                                                                                                                         | Add tiered quality: auto-drop DPR to 1, then shadows to 512 or off, when frame time stays above 16ms. Offer a "Low graphics" toggle in pause (AMIX's "3D off" idea).                                                                                                                                                                                |  P1 | M      |

### C. HUD and in-level UI

| #  | Finding                                                                                                                                                                                       | Scope                                                                                                                                                                                                 | P  | Effort |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -- | ------ |
| C1 | **The attempt counter is small** (16px marigold, top-left). It is the number the whole game is about.                                                                                           | Make it bigger, in mono, with a 150ms tick on increment (the one allowed motion). Make it read like marks on a sheet: "Attempt 18".                                                                     | P1 | S      |
| C2 | **Touch zones give no feedback.** They are labels in an `aria-hidden` strip with no pressed state, and the quarter/quarter/half split is still the unvalidated Phase 0 default (memory.md).                 | Light a zone while it is held, add a left-handed swap in settings, and validate the split on a real phone.                                                                                              | P1 | S      |
| C3 | **The desktop portal shows touch zones** (`(touch \|\| portal)`, `play-host.tsx:382`). They cover the bottom of the course on desktop CrazyGames.                                                 | Show them only when the pointer is coarse.                                                                                                                                                            | P0 | S      |
| C4 | The hint list overlays the top-left of the course while you play.                                                                                                                              | Show only the latest hint, collapsible, so it doesn't sit over platforms when the camera is high.                                                                                                       | P2 | S      |

### D. Menus: pause and result slip

| #  | Finding                                                                                                                                                                                                                                       | Scope                                                                                                                                                                                                                                                                                                                                             | P  | Effort |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -- | ------ |
| D1 | **The result slip breaks its own spec.** DESIGNING.md §2.2 and §3.5 say "the death number is the hero: 61px mono red-pen". It currently renders as a 16px row in a list (`play-host.tsx:574`).                                                | Put the deaths in huge mono red-pen with everything else quiet. Change the real slip and level 15's fake in the same commit, since the fake *is* this component.                                                                                                                                                                                       | P0 | S      |
| D2 | **The spec's one moment of theatre is missing:** the 800ms dot-matrix "print" of the slip (§2.3). Nothing implements it.                                                                                                                       | Add it, skippable, with reduced motion going straight to the printed slip. Use it on chapter clears first, as spec'd.                                                                                                                                                                                                                                 | P1 | S      |
| D3 | **Pause has six equal stacked buttons and a link** (screenshot 07). Hierarchy is flat and there are no settings.                                                                                                                             | Resume (primary) → a row of Restart / Hint / Watch → links (Levels, Home). Add a small settings group: sound volume, low graphics, controls layout, reduced-motion override.                                                                                                                                                                            | P1 | S      |

### E. Platform shell: home, levels, party

| #  | Finding                                                                                                                                                                                                                                                                                         | Scope                                                                                                                                                                                                                                                                                                                                              | P  | Effort |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -- | ------ |
| E1 | **The levels page has no way home.** The header is a `<p>`, not a link (`levels/page.tsx:19`).                                                                                                                                                                                                  | Make it a link and share one masthead component across levels, party and home.                                                                                                                                                                                                                                                                      | P0 | S      |
| E2 | **There are two design systems and the docs describe only one.** Home is a dark navy dashboard with lime and periwinkle, using gradients and box shadows (`home.css`). Levels, party and menus use the paper system (screenshots 08, 09). DESIGNING.md still says the shell is paper with no gradients. Token names lie: `home-marigold` is lime `#DBF367`, `home-red-pen` is coral. | Decide and document the system (see §4). My recommendation: the **dark desk** for every shell page and **paper only as slips** handed to you (menus, results, notices). Rename `home-*` tokens by role (`desk`, `desk-ink`, `go`, `fail`, `party`). Update DESIGNING.md (it's your spec, so with your sign-off) or write the DESIGN.md from §4. | P1 | M      |
| E3 | **The level board is a flat 40-row list** with no "continue" and no difference between cleared and unlocked-but-uncleared (screenshot 08).                                                                                                                                                       | Make it a real result sheet: a "Continue level N" CTA, per-row stamps (*Passed / Failed / Absent*), deaths and best time in mono columns, a subtotal per chapter, and the global median when the backend lands.                                                                                                                                         | P1 | M      |
| E4 | **Home details.** "Tilt to inspect" shows on touch devices where tilt can't work (screenshot 03). Uppercase 10–11px mono labels break DESIGNING §2.2's no-all-caps rule and the skill's 11–12px floor (`home.css:201, 260, 262`). "0 coins · 0 XP" greets every new player.                                     | Show "Tap to play" on touch, use sentence case at 12px or more, and hide the wallet until the balance is above 0 (or until coins buy something, see F1).                                                                                                                                                                                            | P0 | S      |
| E5 | **The home looks the same for a returning player.** DESIGNING's hero, the live global death count, needs the backend.                                                                                                                                                                         | An honest local stand-in for returning players: "You've died 17 times. Most of them on Welcome." plus "Continue level 2". First-time visitors keep the pitch. This follows the skill's "settled screen for returning visitors".                                                                                                                      | P1 | S      |
| E6 | **The third accent is creeping in.** Periwinkle `home-party` plus lime plus coral starts to read as the generic "navy and purple" look, which the skill's DL-069 entry explicitly lists to avoid.                                                                                                | Keep one accent per job: lime means "go/play", red means failure. Make the party block ink-on-desk with seat-colour dots instead of a periwinkle slab.                                                                                                                                                                                               | P2 | S      |
| E7 | **The party lobby is plain.** Players are "Player N" and mode cards are text only (screenshot 09).                                                                                                                                                                                               | Use generated, non-free-text names ("Roll no. 14"), which respects the no-free-text rule. Add a tiny looping preview per mode and make the share-link button primary.                                                                                                                                                                              | P2 | M      |

### F. Retention and meta

| #  | Finding                                                                                                                                                         | Scope                                                                                                                                                                                                                                 | P  | Effort |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -- | ------ |
| F1 | **Coins are earn-only and nothing spends them** (`platform-sdk/src/wallet.ts:4`). A number with no use is noise.                                                    | Add a cosmetic sink: runner outfits from the existing token palette, death-mark styles (✗, stamp, "See me"), and taunt packs. It stays device-only until the server wallet exists, so it should stay cosmetic.                             | P1 | M      |
| F2 | The Daily Trap card says "No streak yet" and little else.                                                                                                       | Show today's level name, your best attempt count today, and the streak as a row of stamped days.                                                                                                                                     | P2 | S      |
| F3 | No chapter-end moment beyond the slip.                                                                                                                          | A chapter "result declared" sheet with the D2 print, the chapter's total deaths, and the worst level as "Subject to improve".                                                                                                        | P2 | M      |

### G. Audio

| #  | Finding                                                                                                     | Scope                                                                                                                                                                                                                                 | P  | Effort |
| -- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -- | ------ |
| G1 | There are four synthesised sounds: jump, death, trap and clear (`audio.ts`). No music, landing, UI or taunt sounds. | Keep the zero-payload synth approach. Add a landing thud, a rubber "stamp" sound on each taunt and on slip stamps, a soft UI tick, and a short generated loop per chapter (8–16 bars, ducked on death). Add a volume slider (D3).            | P1 | M      |

### H. Accessibility

Already good: `:focus-visible`, 44px targets, `prefers-reduced-motion`, `aria-live` on attempts
and hints, and dialog semantics on slips. Gaps:

- No key remapping or one-handed layout. Add it with C2's left-handed touch swap. **P2 · M**
- The `role="status"` taunt fires on every death. A held-key death loop (A2) floods screen readers;
  A2 fixes most of it. **P1 · S**
- Hazards are red cones on beige concrete. The shape carries the meaning, so this is fine, but test
  level 16 "Lights Out" for low-vision contrast. **P2 · S**

### I. Process (the design skill's loop)

- **No DESIGN.md or PRODUCT.md in the skill's format.** DESIGNING.md predates the dark home and no
  longer describes what shipped. Write them (§4 has a draft North Star and rules), including a
  *Locked / Shipped / Tried-removed* log so removed ideas aren't re-proposed.
- **Measure:** take screenshots at 375 / 768 / 1440 for every changed view and run Lighthouse ≥ 90 on
  home and levels. Lighthouse has never been run (memory.md). Measure frame times in level 1 on a
  mid-range Android.
- **Pre-ship checklist:** run `anti-patterns.md` §"Pre-ship review checklist" before each release.
  Today it fails on items 4 (accent jobs), 5 (all-caps, sub-12px labels), 6 (some screens checked only
  at one width) and 11 (no Lighthouse).

---

## 4. Proposed design direction (from the design skill)

**Creative North Star: "The Invigilator's Desk".** The shell is a dark exam-hall desk at night.
Everything official arrives as a **paper slip** laid on it: pause, results, notices, the level list.
The level is the exam paper, and your failures are **corrected in red pen**.

This keeps the existing exam-sheet concept and the dark home you already shipped, and it explains
why paper appears only in places.

**Named rules**

1. **Red pen marks failure, and only failure.** Deaths, hazards, corrections. It never appears on a button.
2. **Paper is handed out, never painted.** Paper appears only as discrete slips over the dark desk,
   never as a page background.
3. **The number is the hero.** On every result surface, the death or attempt count is the single huge
   element (61px mono). Nothing competes with it.
4. **Every death leaves a mark.** A ✗ where you died, the stamp sound, the slash. Failure is visible,
   countable and shareable.

**References, one job each** (from the library; borrow the move, not the content)

| Job                 | Reference                       | Move to borrow                                                                                         |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Microcopy and slips | DL-070 Shiv Shakti              | Figure captions and bracketed mono labels ("Fig. 03"), paper plus one accent: your notice/slip language |
| Hero                | DL-001 Smooothy                 | Colour coming only from content on a dark ground; the object (the runner) breaking out of its frame     |
| In-level overlay    | DL-032 Igloo                    | Mono corner readouts over a cinematic scene; a glitch as the transition that sells the meta-traps       |
| Entry and settings  | DL-016 AMIX games               | A one-tap entry that unlocks sound; a "3D off / low graphics" switch; always a plain list as fallback   |
| Catalogue (later)   | DL-069 CrazyGames               | Only when titles exceed about 6: rows with mixed tile sizes. Avoid its badges and navy-purple look      |

---

## 5. Roadmap

**Now: one or two sessions, no sim changes, no fixture churn**

1. E1: link from the levels page to home.
2. A2: discard held input after a death.
3. C3: touch zones on coarse pointers only.
4. A8: keep the controls hint until the first jump.
5. E4: tap copy on touch, sentence case, 12px floor, hide a zero wallet.
6. A3: red-pen slash on death.
7. D1: deaths as the hero of the slip (real slip and level 15 fake together).
8. A4: red-pen ✗ marks at previous death spots.

**Next: the visible upgrade**

- B1 camera re-frame → B3 chapter backdrops → B2 level pan and progress ruler.
- B4 home hero as a pre-rendered loop of the real game.
- D2 dot-matrix print, D3 pause hierarchy and settings, C1 attempt counter, C2 touch feedback.
- E2 a single shell system plus DESIGN.md; E3 the result-sheet level board; E5 the returning-player home.
- G1 audio pass; B5 quality tiers; Lighthouse and phone measurements.
- A6 best times and best-run ghost; A7 saved hints; F1 cosmetic coin sink.

**Later: determinism or backend work**

- A1 coyote time and jump buffer (a physics change: fixtures, re-solve, fairness).
- A5 real checkpoints for chapter 4.
- The global death counter hero, rank on the slip, leaderboards (Phase 2b/4b; needs Supabase/Upstash).
- E7 party names and previews, F3 chapter result sheets.

---

## 6. Constraints any of this must respect (from CLAUDE.md)

- Sim changes (A1, A5) are intentional physics changes. Regenerate fixtures only for them, re-solve
  every layout, run `fairness` and `daily:check`, and log it in `memory.md`.
- Render-only additions (A3, A4, B1–B5, C*) must read sim state and never write it. Three.js stays
  in `render.ts` behind the dynamic import.
- `ClearedSlip`, `LoadingScreen` and `ErrorScreen` are frozen and shared with the fakes. Change the real and
  fake versions together, and fake controls may only call `game.nudge()`.
- Colours come from `packages/ui/src/tokens.ts` only. Run `pnpm --filter @jom/ui generate` and add new
  pairings to `PAIRINGS`.
- English copy, sentence case, deadpan, no exclamation marks.
- `pnpm verify` before calling any of it done.
