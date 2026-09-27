# System Logic — Just One More

**Only verified behavior belongs in this file.** Everything below was traced in the code and
exercised by tests on 2026-09-23 (Phase 2a additions: 2026-09-24; Phase 3a and 4a: 2026-09-25; Phase 5a and 5b: 2026-09-26) unless marked `UNVERIFIED`.

---

## Frontend logic

### Routes (`apps/web/app`)

| Route                       | Rendering                                                       | Behaviour                                                                                                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                         | static                                                          | Home. Play → `/play/rage`, All levels → `/play/rage/levels`; numbered "Games" list from the `TITLES` registry (the platformer, Push Party → `/party`); wallet balance in the masthead. No live death counter yet (no number is faked). |
| `/play/rage/levels`         | static                                                          | Notice board over all levels: lifetime deaths per level from the device save; rows past `unlocked` read "Locked", are struck through and are not links.                                                                                |
| `/specimen`                 | static, `noindex`                                               | Renders every colour, type-scale step, space step, and the contrast audit from `@jom/ui`.                                                                                                                                              |
| `/play/[title]`             | SSG for `rage` only; `dynamicParams = false` → other titles 404 | Renders `PlayHost` (client).                                                                                                                                                                                                           |
| `/c/[code]`                 | dynamic                                                         | Challenge landing. `code` = `rage-<level 1–10>-<deaths 0–9999>`, Zod-validated (`challenge.ts`), else 404. "Play level N" → `/play/rage?level=N&vs=deaths`.                                                                            |
| `/party`                    | static shell, client-only                                       | Party play. Create a Race, Sabotage or Push Party room or join by 6-char code; `?code=` is the invite link. Lobby (4 or 8 seats), round HUD, emotes, results with wallet earnings. See "Realtime" below.                               |
| `/c/[code]/opengraph-image` | dynamic, PNG 1200×630                                           | Friend's count huge + level; fonts from `apps/web/assets/fonts/*.woff`. Invalid code → 404. Linked as `og:image` / `twitter:image` (summary_large_image).                                                                              |

### Play host (`app/play/[title]/play-host.tsx`)

1. On mount, creates a telemetry bus: storage = `localStorage` (null if blocked), transport =
   console logger in development, **none in production** (events only queue locally).
2. Builds a `PlatformContext` with `createDeviceContext({ titleId: 'rage', storage, emit })`,
   then `import('@jom/game-rage')` → `mountGame(container, { ctx, levelIndex, onHud })`.
   `?level=N` (1-based) requests a start level; without it the game resumes at the highest
   unlocked level. A mount failure calls `recordRealError(storage)`.
3. Status: `loading` → `ready`, or `error` → `ErrorScreen` ("The game didn’t load. Reload the
   page to try again.", `role=alert` only when real). Meta-trap fakes render the **same**
   components: `hud.fake = 'loading'` → `LoadingScreen`, `'error'` → `ErrorScreen`,
   `'complete'` → `ClearedSlip` with `onAny`. On a fake, any pointer press or control calls
   `game.nudge()` (links `preventDefault`), so it can only ever dismiss the lie.
4. HUD (DOM, from `onHud`): level number + name (or "Daily Trap · <UTC date>"), attempt;
   when bindings are not the usual, "← is X · → is Y · Space is Z" (touch zone labels show the
   same); a countdown (seconds, one decimal) top-right while a timer runs; buttons (44px) for
   sound on/off and pause. On every new `deathId` the taunt shows for 1.8s. Desktop shows a key hint only on
   level 1, attempt 1. Touch devices (`pointer: coarse`) show Left / Right / Jump zone labels.
5. `status = paused` → paper "Paused" slip: Resume, Restart level, "Share last death" (only
   when `attempt > 1`), All levels, Back to home.
   `status = cleared` → "Level cleared" slip: attempts, time, lifetime deaths here, rage score
   row + its line; with `?vs=` on that level, "Your friend died X here. You died Y." plus a
   verdict; Next level (or "Play from level 1"), marigold "Share clip", Replay level, Back to home.
   `?vs=N` (`^(0|[1-9]\d{0,3})$`) together with `?level` mounts with `challenge: true`.
   `?daily=1` mounts with `daily: utcDay()`. The cleared slip then adds a "Daily streak" row,
   says "A new trap tomorrow. Same time, same mistakes.", and has no Next level button. On the
   last chapter level it says "Chapter 4 coming soon.".
6. Share: URL = origin + `/c/rage-<level>-<lifetime deaths here>` (Daily Trap: origin + `/`); `game.clip(url)` → File;
   `clip_made {level, format, ms}`; `shareClip` → native sheet (`share {channel: native}`) or
   file saved (`channel: download`), which reveals "Send on WhatsApp" (`wa.me/?text=`) and
   "Copy link" (each emits `share` with its channel). A close of the native sheet emits nothing.
   Failure → "The clip didn’t work on this device. The link still does." + the same links.
   Share state is keyed to `run:attempt:status`, so it never leaks into another run's slip.
7. `pagehide` → `telemetry.flush()`. Unmount → destroy game, destroy bus. A mount that resolves
   after unmount is destroyed immediately.
8. A visually hidden "Back to home" link appears on keyboard focus.

### Game controller (`packages/game-rage/src/game.ts`)

```
rAF frame(now)
  → unless paused/cleared: FixedStepDriver.advance(dt ≤ 250ms): 0..5 fixed 60Hz steps
      each step: mask = input.read(); events = step(state, mask, level)
        Jumped → jump sound + stretch;  Landed → squash;  TrapFired → trap sound
        Died   → hard cut (no interpolation), death sound, debris + 120ms shake (not with
                 reduced motion), lifetime deaths +1 (ctx.saveProgress), pick taunt, re-arm
                 meta-trap, ctx.emit level_death {level, attempt, cause}, HUD update
        Cleared→ clear sound, unlock next level, ctx.emit level_clear {level, attempts, frames}
  → view.render(state, interpolated px/py, dt)
```

- Keys: Esc / P toggle pause; R restarts the level (not while paused); Enter after a clear
  loads the next level (or level 1 after the last).
- Tab hidden (`visibilitychange`) → auto-pause.
- Mount: `sessions++` and save. Start level = min(requested ?? unlocked, unlocked), so a
  locked level can't be started by URL — except the one level of a challenge
  (`challenge: true`), which `load` allows even on restart. Clearing a level above `unlocked`
  does not raise `unlocked`.
- Every step while not cleared: `recorder.record(state.frame, mask)` (change-only log) and
  `presses += new bits in mask`. Died → `deathEnd = state.frame`; Cleared → `clearEnd`.
  `load` resets the log, presses, both ends, and increments `run` (in the HUD).
- Cleared HUD carries `rage = rageScore(presses, clearFrame)`: presses/second → score
  `round((pps − 1) × 15)` clamped 0–99, lines at < 20 / 45 / 70 / 90 / 100.
- `clip(url)`: null if nothing happened this run; else `makeClip` for `deathEnd || clearEnd`
  (the last death wins over the clear) with the lifetime deaths on this level.
- Meta-traps, all only when `metaTrapAllowed` passes (not in session 1, not within 10 min of
  `lastRealErrorAt`):
  - level 8 `fakeLoading` / level 24 `fakeError`: armed at the start of attempts 1–2; end on
    the first non-zero input mask or when `attemptFrame ≥ metaTrap.frames` (≤ 180). The sim
    keeps running underneath (level 24's floor vanishes at 150 frames: waiting loses);
  - level 15: on `SimEvent.MetaTrap` (a fakeClear door) `fake = 'complete'` until the sim's
    `freeze` reaches 0. `clearMs` and `rage` are filled from the current frame so the slip
    looks real.
- `nudge()` ORs `Input.Down` into the next frame's mask: a click becomes recorded input.
- Ghost levels (`view.ghosts`): after each death, `view.setGhosts(attemptTracks(...))` from the
  run's input log (last 12 failed attempts).
- On a clear: `progress.best[levelId] = {frames: clearFrame, deaths, log}` when faster than the
  stored one (and ≤ 36 000 frames, ≤ 4 000 log entries). Daily mode updates `progress.daily`
  with `recordDailyClear` instead of `unlocked`.
- HUD re-emits when the countdown (0.1s steps) or the bindings change.
- Daily mode (`options.daily`): the pool is `[dailyLevel(day)]` instead of `LEVELS`.
- `load(i)` starts a fresh sim for level i (seed = `deriveSeed(levelId, 1)`), telemetry
  `level_start {level}`.
- **"Watch how" (`watchHow()`):**
  - `load(i, watch)` restarts the level from sim seed 1, reading masks from the level's
    recording in `levels/solutions.json` instead of the keyboard, and emits
    `level_watch {level}`.
  - The recording matches the player's current attempt layout: `runFor(level, attempt)` picks
    the recorded attempt (`id` or `id@k`) whose `attemptLayout` equals the current one, and the
    demo runs from that attempt. When it ends, the level resumes at the player's own attempt.
  - During the demo:
    - `hud.demo = {keys}` carries the mask being pressed (the shell lights ← → Jump);
    - no recording, presses, lifetime deaths, taunts, ghosts or `level_death` are recorded;
    - fake screens stay off, and status never becomes `cleared`.
  - On reaching the door: the clear sound, then after 900ms `load(i)` for real. No unlock,
    best run, wallet or `level_clear`.
  - Esc or `stopWatching()` returns at once. Other keys are ignored during the demo.
  - There is no demo on the Daily Trap (`canWatch` false).
- HUD `hints`: the level file's hints (`[]` on the Daily Trap).

### Help pacing (`apps/web/app/play/[title]/play-host.tsx`)

- With ≥ 3 lifetime deaths on the level, a "Hint" button reveals hint 1, then "Hint 2 of 3",
  then "Hint 3 of 3". Read hints show in a numbered card (`aria-live`); telemetry
  `hint_read {level, hint}`.
- "Watch how" is offered when `canWatch` and (≥ 6 deaths, or all hints read). Both also appear
  in the pause panel.
- When a demo hands the level back, "Your turn." shows for 1.8s.
- Hints read are kept in React state per level index (not saved; a reload starts over).

### Renderer (`packages/game-rage/src/render.ts`)

- Three.js, read-only on sim state. World = level px / 32; player on z = 0; slabs 4 units deep,
  drawn 2px narrower than their colliders so tiles show seams.
- Lighting: hemisphere + one directional sun with PCF soft shadows (1024 map, follows the
  camera); RoomEnvironment reflections at 0.35; ACES tone mapping.
- Camera: perspective, 38° fov; distance keeps ≥ 11 units high and ≥ 13 units wide in view;
  follows the player horizontally (clamped to the level ends) and keeps the feet ~30% up the
  screen (mirrored under flipped gravity). A level with a solid or real door above 40% of its
  height, or any crusher, instead frames its full height, centred. Fog starts 6 units behind
  the play plane.
- Collapsed slabs fall and spin; an untriggered saw is hidden entirely (its shadow would give
  it away); the active door slides when a goalShift fires.
- Erupting spikes scale up from their base (0.18 → 1) while up; the crusher is a slab with red
  teeth; coins spin and glow; doors (real and fake, and fakeClear) are primary (marigold) or
  alt (red-pen) and shown only while their attempt scope matches.
- Pop-up spikes (`erupt: near`) are invisible (`visible = false`, scale 0.01) until the sim
  fires them, then spring up (ease 45/s); they hide again on a new attempt.
- The player is a procedural person (`makeHuman`), 1 unit tall to match the 24×32 px box:
  - built from spheres, capsules and boxes: head, hair, eyes, nose, neck, torso, two-part
    arms and legs on hip, knee, shoulder and elbow pivots, hands and shoes;
  - materials: hoodie `playerMat` (marigold; `setTint` recolours it), jeans cobalt ×0.45,
    skin paper-shadow lerped 22% to vermilion ×0.92, carbon hair and eyes, chalk ×0.9 shoes;
  - turns 1.15 rad towards the direction of travel;
  - on the ground: a stride whose phase advances with |vx|, the recovering knee bent, arms
    countering, a forward lean up to 0.14 rad, and breathing when still;
  - in the air: rising tucks a knee with arms up, falling reaches the legs with flailing arms;
  - jump and land squash/stretch act on the body; it flips upside down under flipped gravity
    and eases to 2× after a grow.
- Ghosts, the clone and party players use the same figure (ghosts and clone all in translucent
  chalk, no shadows; party players with their seat colour as the hoodie). They are animated from
  how far they moved since the last frame (a jump over 20px/frame, as on a respawn, is not
  animated), placed feet-down at their box.
- Chapter tint (`view.chapter`): concrete is paper-shadow (ch1, daily), saw ×1.05 (ch2),
  red-pen ×0.42 (ch3), jade ×0.55 (ch4). Ice slabs are glassy chalk. A solid with `text` prints it (Khand, ink on
  chalk) on its front face.
- Springs (coil + red pad) are hidden until first used when `hidden`; teleports look like a
  checkpoint flag. The clone and ghosts are translucent chalk (opacity 0.35).
- `view.dark`: hemisphere 0.05, sun 0.08, environment 0.03, carbon background; a chalk point
  light (intensity 26, distance `dark/32 × 2.4` units) follows the player.
- `view.spin`: the camera rolls `spin`°/s (not with reduced motion).
- `view.frameW`: the camera clamps to `[0, frameW]` until the player's centre passes it.

### Clips (`packages/game-rage/src/clip.ts`, `packages/clip`)

- Replay: fresh sim with the game's seed; `InputReplayer` over the run log; headless to
  `max(0, end − 300)`; then each video frame steps 2 sim frames (30fps) through a second
  `createView(detached div, {w: 720, h: 840})`, forwarding Jumped/Landed to the view.
- At the final step (`frame = end − 1`) the pre-step state is cloned. Death → `view.died`,
  then 24 hold frames render the clone with the player hidden (debris over the trap). Clear →
  hold on the post-step state.
- Every frame is composed onto a 720×1280 2D canvas: paper; "Just One More · Level N · Name"
  (mono 26); headline "I died here N times." / "once" / "Cleared it first try." (Khand 72,
  red-pen); the game view; ink rules; count (mono 150) + "death(s)" (Khand 44); the URL
  (mono 24). Colours and families from `@jom/ui`.
- Encoding: `pickVideoType` (mp4 avc1 → mp4 → webm vp9 → vp8 → webm) unless
  `hardwareConcurrency ≤ 2`; `recordCanvas` = `captureStream(30)` + MediaRecorder at 2.5Mbps,
  frames paced by rAF. Output ≤ 15MB → `just-one-more.mp4|webm`. Otherwise (no type, too big)
  → PNG of the frame before the end, `just-one-more.png`. The view is always disposed.
- `shareClip(file, text)`: `navigator.share({files, text})` when `canShare({files})`;
  AbortError → null; any other error or no support → `saveFile` (object-URL anchor download,
  URL revoked after 10s) → `'download'`.

### Taunts, progress, sound

- `pickTaunt`: 31 English lines tagged early (≤ 2 deaths) / repeated (≥ 5) / close (< 140px
  from the active door) / fall / spike / saw / crush / greed / door / any; context lines weigh 3×; level overrides join the
  early pool; never the same line twice in a row; `{n}` → death count.
- Progress `{ deaths: {levelId: n}, unlocked, muted, sessions, daily: {last, streak, best},
best: {levelId: {frames, deaths, log}} }` goes through
  `ctx.loadProgress/saveProgress` and is validated by `readProgress`. The device context stores
  it at `jom:save:rage:v1`; every storage access is try/catch (corrupt save → fresh start).
  `readProgress` drops a malformed `daily.last` (not `YYYY-MM-DD`), and any `best` entry whose
  frames are outside 1–36 000 or whose log fails `validateInputLog` (at most 64 entries).
- Daily streak (UTC days): clearing on the day after `last` → streak + 1; the same day → no
  change; later → 1; `best` = max. `liveStreak` shows the streak only if `last` is today or
  yesterday, else 0.
- `unlocked` is clamped to the levels that existed when it was saved. `unlockedIndex(progress,
ids)` (used by the game on load and by the level board) moves it past every level that has a
  `best` clear, so a player who finished level 30 before chapter 4 existed can start level 31.

### Daily Trap (`packages/game-rage/src/daily.ts`)

- `dailyLevel(day)`: seeded by `fnv1a('daily:' + day)` through mulberry32. Start floor to x 240,
  then 5–6 features, each after a 170–240px runway: gap (70–110px), spikes (32–56px), collapse
  tile over a pit (80–100px, 6–10 frames), saw (trigger at x, drops at x + 70), coin on the
  ground, fake door. Then a runway and the real door (`alt` look); width = door x + 120.
- Every generated day is meant to be clearable by construction; `daily:check` solved 60
  consecutive days (2026-09-25 onward) and a test solves three fixed days.
- Sound: Web Audio oscillators (jump, death, trap, two-note clear), created on first use,
  mute persisted.

### Input (`packages/game-rage/src/input`)

- Keyboard by `KeyboardEvent.code`: ArrowLeft/KeyA → Left; ArrowRight/KeyD → Right;
  ArrowUp/KeyW/Space → Jump; ArrowDown/KeyS → Down; every other key ignored. Mapped keys call
  `preventDefault` (no page scroll).
- Touch (pointer events, `pointerType !== 'mouse'`): touch kind fixed at touch start — left half
  = move, right half = jump. A move touch is Left in the outer quarter, Right in the inner
  quarter, and stays a move touch even if it slides past the midline. Pointer capture is taken.
- Mouse is ignored (desktop is keyboard-only).
- `blur` and `visibilitychange → hidden` release all keys and touches.
- `read()` ORs every held key's bit and every active touch's bit.

## Simulation logic (`packages/engine`)

- Units: integers, 1px = 1000 units (`toFixed = px*1000 | 0`); floats only in `toPx` for render.
- Fixed step: `STEP_MS = 1000/60`; accumulator; ≤ 5 steps per `advance`; if still behind, the
  backlog is discarded (reported as `droppedMs`); negative/NaN/∞ deltas count as 0.
- Levels: JSON schema 1 validated by `parseLevel` (throws `LevelError` with a path), compiled
  by `compileLevel`. Traps and doors carry an attempt scope (`when.from`/`to`/`parity`
  odd|even, default all attempts). `metaTrap` accepts only `fakeLoading` or `fakeError`,
  `frames` ≤ 180. Solids may be `ice` or carry `text`; `view` hints (`dark`, `spin`, `frameW`,
  `ghosts`) and texts compile into `SimLevel.view` only for chapter 2+ or hinted levels.
  `goals[]`: the first door in scope is the real one (`activeGoal`).
- `step(state, rawMask, level)` order: if cleared, only frame++ → the mask is remapped by
  `bindings` (invert swaps L/R; shuffle picks one of 6 orders of L/R/J by
  `floor(attemptFrame / every)`, the first period normal, consecutive periods different; Down
  passes through) → if `freeze > 0` (fake clear): any new bit ends it (or it counts down from
  180), then the fired fakeClears' targets vanish; nothing else moves → the clone (if active)
  moves on its script; it turns solid once it no longer overlaps the player → the logical mask
  is appended to `curLog` on clone levels → `moveBody` for the player: horizontal accel (ground
  900 / ice 250 / air 600, cap 4500) or friction (ground 1200 / ice 40 / air 150); jump on press
  edge only when on ground (vy = −10500); jump-release while rising halves vy; gravity +600,
  capped at 14000 **only in the direction of gravity**; move X, resolve against non-collapsed
  solids and the clone, clamp to bounds; move Y, resolve (landing sets onGround and `floor`) →
  traps:
  - collapse: once stood on, counts `delayFrames`, then the solid is gone for this attempt;
  - spike: kills on overlap with its rect inset by 3px on every side, only while up.
    `erupt: jump` — up for `value` frames after each jump; `erupt: time` — up from
    `attemptFrame ≥ value` on; `erupt: near` — pops up (and stays up for the attempt) once
    the player's centre is within `distance` px horizontally of the spike's edge; otherwise
    always up;
  - saw / crusher (both compile to a `faller`): fires when the player's centre passes
    `triggerX`, then falls `speed` px/frame to `fallTo`; kills on inset overlap (Saw / Crush);
  - coin: kills on inset overlap (Greed);
  - fakeGoal: kills on overlap with its rect inset by 3px, like other hazards (FakeDoor);
  - goalShift: once, when the player's centre is within `triggerDistance` of the active
    door's centre, that door moves `dx`;
  - gravityFlip: once per attempt, when the player's centre passes `triggerX`, gravity
    inverts (jump, landing and fall-out mirror; leaving through the top is also Fall);
  - invert / grow: once, past `triggerX`: bindings swap L/R, or the player becomes 48×64
    (x −12, y −32 under normal gravity);
  - spring: overlap while not moving against gravity ⇒ vy = −power × gravity (Jumped event);
  - timer: at `attemptFrame ≥ frames`, the target solids are gone (`timeLeft` for the HUD);
  - teleport: first overlap sends the player to spawn with zero velocity (not a death);
  - fakeClear: first overlap ⇒ `freeze = 180`, velocity 0, `SimEvent.MetaTrap`;
    → death (hazard, or `y > bounds.h` = fall) ⇒ `lastDeath` = cause + position, deaths++,
    attempt++, on clone levels `cloneLog = curLog`, whole attempt reset (player at spawn,
    normal size, bindings and gravity normal, solids back, traps re-armed for the new attempt,
    door back, clone at spawn and active if it has a script) → else overlapping the door ⇒ cleared, `clearFrame` recorded →
    prevMask = mask, frame++.
- Overlap is strict (touching edges do not collide).
- Randomness: only `nextRandom(state, n)` (mulberry32 over `state.rng`). Seed =
  fnv1a(`${levelId}:${attempt}`).
- Input logs: change-only `[frame, mask]`, strictly increasing frames; `InputReplayer` is
  forward-only; `validateInputLog` rejects non-arrays, non-pairs, negative/fractional frames,
  unknown mask bits (> 0b1111), out-of-order or past-end frames.
- `replay(level, seed, log, frames)` ⇒ identical `hashState` for identical inputs (50 fixtures
  across the sandbox and three all-traps levels, also run in plain Node). Each of the 40
  levels has a zero-death clear in `game-rage/levels/solutions.json`, found by the beam-search
  solver (`scripts/solver.ts`: 8 moves held 5 frames, beam 400 with ≤ 6 per 16px cell plus a
  seeded random quarter) and replayed by `levels.test.ts`.
- Attempt layouts: `createSimState(level, seed, attempt = 1)` can start at any attempt.
  `attemptLayout(level, attempt)` is the set of traps and doors in scope; `distinctAttempts`
  lists the first attempt of each distinct layout among attempts 1–8 (`LAYOUT_ATTEMPTS`; scope
  ranges must end by attempt 7). Every layout after the first has its own recording, keyed
  `id@k`, and `levels.test.ts` replays each one to a clean clear.
- `scripts/solve.ts` runs one job per (level, layout) on worker threads (`--jobs`, default 4)
  and merges each result into `solutions.json` as it lands (re-reading the file, so two solves
  of different levels can run at once).
- `attemptTracks(level, seed, log, frames)`: replays and returns each failed attempt's player
  positions (x, y per attempt frame), ending at the death position.
- `verifyRun(level, claim, {maxFrames = 36 000, floorFrames})` (SECURITY.md §4.2–4.3): rejects
  frames out of range, a malformed seed/deaths, a log failing `validateInputLog`, more than 60
  changes in any 180 frames, a clear under 85% of the floor; then replays and requires the same
  cleared flag, `clearFrame = frames` for clears, and the same death count.

- Gates (multiplayer): a trap may carry `gate` (`'leader'` → bit 1, slot k → `1 << k`, k 1–30).
  A gated trap does nothing (no trigger, no kill) unless its bit is set in `SimState.gates`,
  which only the caller (the realtime server) sets. `hashState` mixes `gates` only when
  non-zero, so solo hashes are unchanged. MP levels are solved with every gate on.

## Push Party simulation (`packages/game-push-party/src/sim.ts`)

- Top-down, integer-only (1px = 1000 units), no randomness; input is a 5-bit mask per pusher
  (Left 1, Right 2, Up 4, Down 8, Shove 16; other bits are ignored).
- Floor: 10×10 tiles of 64px. `tileAt(frame, i, j)` is pure: ring r (0 = edge) starts
  crumbling at `480 + 600r` frames, holds for 90 more, then is gone. Rings 0–3 fall; the
  centre 2×2 never does. Out of bounds counts as gone.
- `stepPush(state, masks)` order:
  1. For each pusher on the floor: acceleration 300 on each held axis (a diagonal counts
     707/1000 per axis), and facing follows the input.
  2. A fresh Shove press with the cooldown at 0 adds a 9px/frame lunge along the facing:
     12 active frames, cooldown 50.
  3. Everyone takes drag `v -= trunc(v / 12)` and moves.
  4. Then pairs on the floor, in seat order: bodies of radius 18px are pushed apart. When
     they are closing, each takes 0.9 of the closing speed (restitution 0.8). A live shove
     that lands adds 7px/frame of knock-back to the other body and is spent; two live shoves
     just bounce.
  5. Then support: a pusher on the floor whose centre is over a gone tile starts falling. A
     falling pusher is out 40 frames later (`outFrame` = that frame).
- `isOver`: with ≥ 2 pushers, when at most one is not out; or at 4500 frames (75s).
  `placings`: longest-lasting first; survivors and simultaneous falls tie.
- Determinism: 20 seeded 8-player runs of 3000 frames match regardless of seat order, and
  every value stays an integer (`test/sim.test.ts`).

## Realtime (`apps/realtime`, Colyseus 0.18)

- Entry: `src/index.ts` listens on `PORT` (default 2567); room name `party`, create options
  `{mode: 'race' | 'sabotage' | 'push'}` (Zod; anything else → `ServerError 400 'Unknown mode.'`).
  Every 10s it logs one JSON line `{metric: 'realtime', rooms, clients, rssMb, loopP99Ms,
loopMaxMs}` (counts only).
- Room code = `roomId`: 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (crypto), unique while live.
- Client address (`limits.ts`):
  - `clientIp` is the socket address. With `TRUST_PROXY=1` it is the **last**
    `X-Forwarded-For` hop (the one our proxy added).
  - `pinClientIp` runs first on every WebSocket upgrade and overwrites `X-Real-IP` with that
    address. Colyseus's `ctx.ip`, which the room caps use, would otherwise take any
    client-sent `X-Real-IP`, `X-Forwarded-For` or `X-Client-IP`.
- Limits (SECURITY.md §5):
  - POST `/matchmake/*` over 1000 an hour per IP → 429 (`guardHttp`).
  - The creator's IP may hold at most 5 live rooms (429) and create 20 rooms an hour (429).
  - Joining while a round runs → 409.
  - Seats: 4 (Race, Sabotage) or 8 (Push Party). 90 messages per second per client.
- Shared lobby rules (`party.ts` `Party`, the base of `Match` and `PushMatch`):
  - Seats are taken lowest-free-first, and the first player in is the host.
  - Emotes are `0–7`, one per second.
  - `next` (host, from results) goes back to the lobby and removes leavers.
  - `start` needs the host, the lobby phase and ≥ 2 connected players.
  - At 20 strikes the verdict is `kick`.
- Lifetimes:
  - A drop gets 15s to reconnect. After that the player has left; leaving mid-round counts as
    a loss (ranked last).
  - A room disposes 10 minutes after it is empty, including a room nobody ever joined.
  - The host passes to the next connected player.
- Round (`Match`, time injected, no networking):
  - The host starts with ≥ 2 connected players. Race: everyone runs `mp-race-01`, 120s.
    Sabotage: one runner (rotates by round over seats) runs `mp-sabotage-01`, 90s; the others
    are saboteurs.
  - Each tick (60Hz) every runner's sim steps to
    `min(clock + 6, max(clientAck, clock − 30))`, applying queued input changes at their
    frames.
  - Race leader: the runner furthest right among those still running, changing only when a
    challenger is 24px ahead. The leader's sim has `LEADER_GATE` on, and nobody leads when
    fewer than 2 are running.
  - Sabotage gates = the armed slot bits.
  - Every gate change is logged `[frame, gates]` per player.
  - End: a race ends when all have cleared or left, or on time. Sabotage ends with a runner
    clear (the runner wins), or when the runner leaves or time runs out (the saboteurs win).
  - Standings: clear frame, then furthest x; leavers last.
- Input checks:
  - Rejected `input {f, m}` messages get no reply.
  - Strikes: a frame past clock + 6, unknown mask bits, or more than 60 changes in 180
    frames. At 20 strikes the client is closed with code 4403.
  - A message that fails the Zod shape check, or an input outside a round, is dropped
    without a strike.
- Sabotage `place {slot}` rules:
  - Allowed only for a saboteur, for an existing unarmed slot, with budget left (2), and not
    within 2s of their last placement.
  - The trap must be 160–900px ahead of the runner.
  - Refusals come back as `nope {reason}`.
- Emotes: `emote {id 0–7}`, one per second, broadcast as `{seat, id}`; no free text exists.
- Push Party round (`push-match.ts`, `PushMatch`):
  - Everyone connected at the start plays, with `createPushState(seats)`.
  - Each tick the one shared sim steps to `min(elapsed(now), ROUND_FRAMES)`. Each step uses
    every player's current mask, applying queued changes at their frames.
  - A player not heard from for 30 frames counts as holding nothing.
  - A player who has left is set out with `outFrame -1` (ranked last).
  - An input stamped earlier than the sim frame applies now, and `late = frame − stamp` is
    kept for the snapshot. A stamp more than 12 frames past wall-clock elapsed is a strike, as
    are unknown mask bits (> 0b11111) and the density rule.
  - End: when at most one player is left standing (of ≥ 2) or the time is up (75s).
    Standings are `placings` plus `left`, sorted by place.
- Server → client messages:
  - `lobby`: code, mode, size (4 or 8), phase, round, level (`null` in Push), host seat,
    runner seat (`null` in Push), seats.
  - `you`: seat, plays, budget, host.
  - `go`: level, round, mode, runner (the last two `null` in Push).
  - `snap`, every 50ms of wall time while playing (timed, not tick-counted):
    - Race/Sabotage: positions, attempts, armed slots and leader; `truths` (every runner's
      `{seat, frame, hash, gates}`); `watch` (Sabotage: the runner's full sim state, else
      `null`).
    - Push: `state` (the whole `PushState`), `masks` (the inputs the last step used, by pusher)
      and `late` (by pusher).
  - `placed`, `emote`, `results {standings, winner}`, `nope`.
  - `state {state, truth}`: the reply to `resync` (Race/Sabotage only).
- Client (`game-rage/src/party-game.ts` via `mountParty`):
  - Predicts its own run with the same engine and sends input changes plus a heartbeat every
    6 frames.
  - From its entry in `snap.truths`: it re-simulates from frame 0 if a gate change lands before
    its current frame. On a hash mismatch it sends `resync` (at most once a second) and adopts
    `state`.
  - Draws the others from `snap` as bodies tinted by seat (`marigold`, `sky`, `jade`,
    `orchid`). Saboteurs see the runner from `snap.watch`, plus translucent markers on unarmed
    slots.
- Client (`game-push-party/src/game.ts` via `mountPush`):
  - On each `snap` it re-simulates from `snap.state` to its own frame. Its own mask comes from
    its input log; the others' come from `snap.masks`.
  - Its frame steps +1 when its `late` is > 0, holds one frame when `late` < −6, and never
    runs more than 10 past the snapshot.
  - It sends changes plus a heartbeat every 6 frames, and `{m: 0}` when the tab is hidden.
  - On `results` it credits the wallet (a win: +10 coins/+15 XP; otherwise +5 XP) and reports
    it in the HUD's `earned`.
- The web client (`app/party/party-client.tsx`):
  - Connects to `NEXT_PUBLIC_REALTIME_URL`. If that is unset, it uses `ws://localhost:2567`
    on localhost. Anywhere else, trying to connect shows "Party play isn’t available here yet."
  - Sends `hello` once its handlers are attached, and the room answers with `you` and `lobby`.

## Platform contract (`packages/platform-sdk`)

- `GameTitle {id, displayName, tagline, players, supportsMultiplayer, href?}`: the shell lists
  titles from this only. It links to `href`, or `/play/<id>` when there is none. Push Party's
  `href` is `/party`.
- `PlatformContext {user, emit, loadProgress, saveProgress, lastRealErrorAt, wallet}`: a
  title's only way to reach platform services. `user` is `null` until Phase 2b.
- `RoomLink {send, on}`: the shell's room connection handed to a title (it owns the Colyseus
  client).
- Wallet (`wallet.ts`, `createDeviceWallet`):
  - One localStorage slot, `jom:wallet:v1` = `{coins, xp}`, shared by every title.
  - `earn(coins, xp, reason)` floors each amount, clamps it to 0–1000 and adds it (never
    subtracts). It emits `wallet_earn {title, reason, coins, xp}`.
  - A corrupt value, a negative number or a non-number reads as 0.
  - Rage earns: a first clear (no stored best run) +10/+10; a Daily Trap clear once per UTC
    day +5/+5; any other clear +2 XP. Push Party earns: see its client above.
  - The home masthead shows the balance (`wallet-badge.tsx`).

## Error handling

- Game mount failure → visible plain-language error in the play host; no retry loop; the time
  is stored under `jom:last-real-error` so meta-traps stay quiet for 10 minutes.
- Telemetry: storage read/parse failure → start with an empty queue; storage write failure →
  in-memory only; transport failure → events stay queued for the next flush.

## Security logic

- Headers on every route (`apps/web/security-headers.mjs` via `next.config.ts`):
  - enforced `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
  - `Content-Security-Policy-Report-Only`: default/script/font `'self'`; connect `'self'` plus
    the realtime origin (`NEXT_PUBLIC_REALTIME_URL`, else `ws://localhost:2567` outside
    production); style adds
    `'unsafe-inline'`, img/media/worker add `blob:` (img also `data:`), form-action `'self'`
  - HSTS 2 years + includeSubDomains + preload, `nosniff`, `X-Frame-Options: DENY`,
    `strict-origin-when-cross-origin`, Permissions-Policy denies camera/mic/geolocation/payment
  - `poweredByHeader: false`; production browser source maps off.
- ESLint `jom/no-server-imports-in-client`: in files starting with `'use client'`, imports/
  re-exports/dynamic imports matching `^server-only$` or `(^|/)server(/|$)` are errors.
- ESLint `jom/no-private-env-in-client`: in `'use client'` files, `process.env.X` is an error
  unless X starts with `NEXT_PUBLIC_` or is `NODE_ENV`; dynamic `process.env[expr]` is an error.
- CI `check-bundle.mjs`: per-page initial JS ≤ 250KB gz; no `__THREE__` (Three.js) marker in
  any page's initial scripts; all client JS ≤ 3MB gz; no non-`NEXT_PUBLIC_` key name from
  `.env.example` in client JS.
- CI `check-no-hex.mjs`: no hex colour in `apps/` or `packages/` source outside
  `packages/ui/src/tokens.ts` and generated `tokens.css`.
- Meta-traps (SECURITY.md §9): fake loading (level 8), fake level-complete (15), fake error
  (24). Each reuses the real component, is the game's own UI only (the level format accepts no
  other kinds), is dismissed by any input including a click, lasts ≤ 3s (fakes' frames capped
  at 180; the fake clear's freeze is 180 frames), and is off in the first session and for 10
  minutes after a real error. Tests pin which levels may use them.
- Clips are canvas-only (SECURITY.md §6.1): the only source is the game's own WebGL render; no
  file input, camera, microphone or screen capture exists in the codebase.
- Challenge codes and `?vs=` are validated by strict patterns before use; the OG image and page
  draw only numbers and our own level names (no player text to escape yet).
- Telemetry props are caller-supplied; current events carry only level id/number, death count,
  frame, clip format/time, share channel and the taunt line shown (game copy, not player text).

## External integrations

None.
