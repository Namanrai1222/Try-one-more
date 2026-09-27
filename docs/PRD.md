# PRD — "Just One More" (Working Title)

**Document type:** Product Requirements
**Owner:** Naman
**Status:** Draft v1.0
**Related docs:** `TECH_STACK.md`, `SECURITY.md`, `DESIGNING.md`, `3D_MODELING.md`

---

## 1. Summary

A browser-first, mobile-friendly **multi-game platform** whose flagship title is a troll/rage
platformer. The platformer is the acquisition engine: it produces short, humiliating,
highly shareable failure clips. The platform around it (accounts, coins, leaderboards,
friend rooms) converts that traffic into retained users who then play the other games.

**One-line pitch:** A game that lies to you and makes you laugh while you lose.

**Why this and not another casual game portal:** the rage genre has proven browser distribution
(Poki-class traffic), near-zero asset cost, ~15 second sessions that suit mobile data limits,
and an organic clip-sharing loop that removes the need for paid UA in month 1.

---

## 2. Goals and non-goals

### Goals
| # | Goal | Measure |
|---|---|---|
| G1 | Hook a first-time player inside 60 seconds | ≥55% of sessions reach Level 4 |
| G2 | Build a share loop that needs no ad budget | ≥8% of players export at least one death clip |
| G3 | Make the platform (not the single game) the destination | ≥25% of returning users play a second game title |
| G4 | Keep the whole thing cheap to run | Infra cost ≤ ₹8,000/month at 50k MAU |
| G5 | Ship playable in public within 6 weeks | Phase 1 live at a public URL |

### Non-goals (explicitly out of scope for v1)
- Real-money gaming, wagering, or anything resembling Teen Patti/rummy with stakes.
  This is a hard legal boundary in India, and touching it changes the entire compliance
  and licensing burden. Not now, possibly not ever.
- Native iOS/Android apps. Web only until Phase 6.
- User-generated levels. Tempting, but it explodes the moderation surface. Phase 7+.
- Voice chat.

---

## 3. Audience

**Primary:** 16–26, Indian, Android + budget laptop, discovers games through Instagram Reels
and YouTube Shorts, plays in 5–10 minute bursts, shares failure not success.

**Secondary:** Global rage-game audience (the Level Devil / Getting Over It crowd) who arrive
via portal aggregators. All UI and copy is in English, so no separate fallback is needed.

**Device reality to design against:**
- 60% mobile portrait, touch controls
- Median device: 4GB RAM Android, Chrome, 4G
- Many users on metered data → hard budget of 3MB initial load

---

## 4. Core game design

### 4.1 The loop
1. Player sees a level that looks solvable in one attempt.
2. The level betrays a specific assumption the player just formed.
3. Instant respawn (< 400ms, no loading screen, no confirm dialog).
4. A taunt fires. The death counter increments and is visible.
5. Player retries because the failure felt like *their* mistake, not the game's unfairness.

**The design rule that everything else serves:** every trap must be understandable in
hindsight. If a player cannot say "oh, now I get it" after dying, that trap is broken
and must be cut. Unfair-and-opaque makes people quit; unfair-and-legible makes people retry.

### 4.2 Difficulty contract
- No single level may exceed **10 deaths at p50**. Instrument this; auto-flag violators.
- Time-to-first-death on Level 1: **under 6 seconds**. This is intentional.
- Every level completable in **under 20 seconds** once solved.
- Chapter difficulty rises, but each chapter opens with a *relief* level to reset tension.

### 4.3 Controls
- Desktop: Arrow keys / WASD + Space. Nothing else. Ever.
- Mobile: two thumb zones (left half = move, right half = jump). No on-screen D-pad clutter.
- Input latency budget: ≤ 50ms from touch to character response.

### 4.4 Level specifications — Chapter 1: "Welcome"

Chapter 1 must do its job in the first 60 seconds: establish that the game has a
personality and that it is lying to you.

| Lvl | Name | Mechanic | Intended emotion |
|-----|------|----------|------------------|
| 1 | Welcome | Floor tile collapses on step 3. Restart: that tile is solid but spikes now cover the gap. Restart: door slides back 2 steps once, then opens. | Ambush. 3–4 deaths, ~35s. |
| 2 | Trust | Completely clean level. Zero traps. | Relief. Rebuilds trust deliberately. |
| 3 | False Trust | Pixel-identical to Level 2. A saw drops from the ceiling mid-run. | Betrayal by muscle memory. |
| 4 | Ceiling | Ceiling descends continuously. Must sprint. | Time pressure, first "real" mechanic. |
| 5 | Reverse Rules | Spikes only erupt when the player jumps. Walking is safe. | Punishes the platformer reflex. |
| 6 | Greed | A large glowing coin. Collecting it kills. | Greed. Expect 4+ deliberate deaths. |
| 7 | Two Doors | Green door fake, red real. On retry the polarity flips. | Pattern-learning punished. |
| 8 | Loading | Fake "LOADING…" overlay while the level is live and the player stands on a spike. | Meta-trap; first UI-level lie. |
| 9 | Upside Down | Gravity inverts at the midpoint. | Spatial re-orientation. |
| 10 | All At Once | Every Chapter 1 trap compressed into a 5-second level. | Exam. Chapter boss. |

### 4.5 Chapter 2 — "Now It Gets Fun" (Levels 11–20)
Traps now target the player's *reactions* rather than the level geometry.

11. Controls inverted (left = right).
12. Character scales to 2x; previously passable gaps no longer fit.
13. Ice physics; no braking.
14. Door relocated to the ceiling; requires finding a hidden spring.
15. Fake "Level Complete" screen, then the floor drops.
16. Darkness; only a small radius around the player is lit.
17. Mirrored layout of Level 16.
18. A shadow clone replays the player's own previous-attempt inputs and body-blocks them.
19. Countdown timer; floor disappears at zero.
20. The entire level slowly rotates during play. **Chapter boss.**

### 4.6 Chapter 3 — "Now It's Personal" (Levels 21–30)
The game now addresses the player directly.

21. Taunt text rendered as a physical platform the player must climb.
22. Nested doors; the third is real.
23. Trap count scales with the player's death count on that level.
24. Fake crash / error screen. Waiting loses; any input advances.
25. A checkpoint that teleports the player back to the start.
26. Control key bindings reshuffle every 3 seconds.
27. Camera lies about level scale — the level is 3x wider than the frame implies.
28. Ghosts of the player's own failed attempts play back simultaneously.
29. A genuinely trap-free level. The trap is that there is no trap; players will waste
    minutes searching. Instrument this one — it is the most likely to backfire.
30. All mechanics combined. Ends on "Chapter 4 coming soon 😈". **Final boss.**

### 4.7 Retention and virality systems

| System | Description | Phase |
|--------|-------------|-------|
| Public death counter | "47,382 people have died on this level. You are number 47,383." Per-level, global, real. | 3 |
| Auto clip | Last 5 seconds before death auto-captured; one tap to share to WhatsApp/Instagram. | 3 |
| Challenge link | Share a level with your attempt count baked in; friend's count returns to you. | 3 |
| Taunt engine | Rotating, weighted, never-repeating-twice-in-a-row death lines. | 1 |
| Daily Trap | One new single level per day, identical for everyone, streak counter. | 4 |
| Rage meter | Tracks input mashing frequency, surfaces a comedic "rage score". | 3 |
| Ghost race | Race your own or a friend's best run. | 5 |

### 4.8 Multiplayer modes (Phase 5)
- **Race Mode:** 4 players, same level, traps trigger preferentially for whoever leads.
  Being in front is a penalty. This keeps races close and loud.
- **Sabotage Mode:** one player runs, three place live traps from a limited budget.
  Highest viral potential in the whole product; prioritise over Race if resources are tight.

### 4.9 The wider platform
The platformer is title #1. The platform shell must be built generically from Phase 2 so
additional titles slot in without rework. Planned title slate (order = build priority):

1. Rage platformer (flagship)
2. Push Party — 4–8 player physics knockout on a shrinking platform
3. Drawing + guess (Skribbl-style) with Bollywood/meme word packs
4. Trivia battles — cricket, film, GK
5. Reaction duel — sub-10-second 1v1
6. Song Chain — each song must start with the last letter of the previous one (later; needs audio moderation, so deliberately late)

Shared across all titles: single sign-on, coins/XP wallet, friend list, private rooms
via one link, global + friend leaderboards, unified clip export.

---

## 5. Success metrics

**North star:** weekly returning players who played ≥2 distinct titles.

| Metric | Phase 1 target | Phase 4 target |
|--------|----------------|----------------|
| Session length (median) | 4 min | 9 min |
| D1 retention | 18% | 30% |
| D7 retention | 6% | 14% |
| Clip export rate | — | 8% of players |
| Level 1 → Level 4 funnel | 50% | 60% |
| Rage-quit point (first level with >25% drop-off) | identify | eliminate |

**Kill criteria:** if after Phase 3 with 5,000 sessions the clip export rate is under 2%
and D1 is under 10%, the viral thesis is wrong. Stop and rethink the hook before building
multiplayer.

---

## 6. Phase plan

Each phase is independently shippable and independently valuable.

### Phase 0 — Foundation (Week 1)
**Exit criteria:** an empty but deployed game shell with CI and a physics sandbox.

- [ ] Repo, monorepo structure, linting, formatting, commit hooks
- [ ] CI pipeline: typecheck, lint, unit test, preview deploy per PR
- [ ] Game engine bootstrapped, renders a controllable rectangle at a stable 60fps
- [ ] Deterministic fixed-timestep physics loop (critical — see §7 Risks)
- [ ] Input abstraction layer (keyboard + touch → same event stream)
- [ ] Analytics event bus stubbed (no vendor lock-in; events queue locally first)
- [ ] Deploy target live at a public URL with a holding page

### Phase 1 — MVP core loop (Weeks 2–3)
**Exit criteria:** Levels 1–3 playable by strangers on their own phones, and they laugh.

- [ ] Level data format defined (JSON schema, versioned) — see `TECH_STACK.md` §4
- [ ] Level editor: minimal, internal-only, can be a JSON file + hot reload
- [ ] Trap system: pluggable trap components (collapse, spike, saw, moving-door)
- [ ] Level state machine: playing → died → respawn in <400ms, no dialogs
- [ ] Levels 1, 2, 3 authored to the spec in §4.4
- [ ] Taunt engine v1: 25 lines, weighted random, no immediate repeats
- [ ] Death counter (local only at this phase)
- [ ] Mobile touch controls with the two-zone scheme
- [ ] Playtest with 10 people in person; record where they quit

### Phase 2 — Full Chapter 1 + platform shell (Weeks 4–5)
**Exit criteria:** 10 levels, accounts, progress persists across devices.

- [ ] Levels 4–10 authored
- [ ] Chapter select / level select screen
- [ ] Auth (see `SECURITY.md` §3) — anonymous play first, account optional and prompted late
- [ ] Server-side progress persistence
- [ ] Platform shell: home screen designed for N titles, not 1
- [ ] Coins/XP wallet schema (earn only; no spend yet)
- [ ] Per-level analytics: attempts, deaths, time-to-clear, drop-off
- [ ] Difficulty audit against the §4.2 contract; retune any level over 10 deaths at p50

### Phase 3 — Viral layer (Weeks 6–7)
**Exit criteria:** a stranger shares a clip without being asked to.

- [ ] Clip capture: rolling 5-second buffer, encode on demand
- [ ] Clip export with branding, sized for Reels (9:16) and WhatsApp (<15MB)
- [ ] Global death counters, server-backed and real
- [ ] Challenge links with OG image generation showing the friend's attempt count
- [ ] Rage meter
- [ ] Share instrumentation: which level, which taunt, which channel

### Phase 4 — Chapters 2–3 + retention (Weeks 8–11)
**Exit criteria:** 30 levels, daily habit loop live.

- [ ] Levels 11–20 (Chapter 2)
- [ ] Levels 21–30 (Chapter 3)
- [ ] Ghost recording/playback system (needed by L18, L28, and Phase 5)
- [ ] Daily Trap with streaks
- [ ] Leaderboards: global, friends, per-level
- [ ] Meta-trap infrastructure (fake UI states for L8, L15, L24) — must be sandboxed so
      it never touches real error handling

### Phase 5 — Multiplayer + title #2 (Weeks 12–16)
**Exit criteria:** four friends can play together from one shared link.

- [ ] Realtime server, rooms, matchmaking by link
- [ ] Race Mode
- [ ] Sabotage Mode
- [ ] Server-authoritative validation (see `SECURITY.md` §5)
- [ ] Title #2: Push Party, reusing the physics and room infrastructure
- [ ] Cross-title wallet and friend list proven with two live titles

### Phase 6 — 3D mode + scale (Week 17+)
**Exit criteria:** a 3D vertical-climb mode ships without degrading 2D load times.

- [ ] 3D climb mode ("Higher and Higher") — see `3D_MODELING.md`
- [ ] Asset streaming so 3D never loads for 2D-only players
- [ ] Titles #3–#5
- [ ] PWA install prompt; evaluate native wrapper

---

## 7. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Non-deterministic physics breaks ghosts, replays, and anti-cheat | High | Fixed timestep + integer-friendly physics from Phase 0. Retrofitting this is a rewrite. |
| The game reads as "unfair" rather than "funny" | High | The legibility rule in §4.1. Playtest every trap with 5 strangers before shipping. |
| Meta-traps (fake crash/loading) get mistaken for real bugs | Medium | Always resolvable by any input within 3s; never on first visit; never for users who hit a real error recently. |
| Clip encoding kills low-end phones | Medium | Encode off the main thread; degrade to screenshot + score card on weak devices. |
| Platform ambition dilutes the flagship | High | Phases 1–4 are the platformer only. Resist adding titles early. |
| Rage genre fatigue | Medium | The comedic voice is the moat, not the mechanics. Invest in the taunt writing. |

---

## 8. Open questions
1. Anonymous-first or account-first? Leaning anonymous, with account prompted at Level 10.
2. Do coins ever purchase anything, or are they pure score? Pure score avoids all
   monetisation and compliance complexity in v1.
3. Monetisation: rewarded video after death is the obvious fit but directly damages the
   sub-400ms respawn that makes the loop work. Defer to post-Phase-4 and A/B carefully.
4. UI language — decided: all copy is in English.
