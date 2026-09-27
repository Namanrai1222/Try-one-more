# DESIGNING.md — "Just One More"

**Related docs:** `PRD.md`, `TECH_STACK.md`, `SECURITY.md`, `3D_MODELING.md`

---

## 1. The design problem

A troll platformer's visual language has one unusual job: **the interface itself must be
capable of lying.** Levels 8, 15, and 24 fake loading screens, completion screens, and
crashes. That only works if the real UI has a strong, consistent identity that the fakes
can imitate exactly. A vague or generic UI makes the meta-traps land as bugs rather than jokes.

The second job: this game mocks you. The visual identity has to carry that voice
before a single word is read.

### The concept — "Result Declared"

Everything outside the level is styled as **an Indian exam result sheet / school notice
board**: the most efficient humiliation-delivery device most of the target audience has ever
encountered. Death counts are printed like marks. The chapter select is a notice board with
a roll-number list. The game-over screen is a result slip with your rank among everyone who
died on that level.

Inside the level, the aesthetic flips to clean, high-contrast pixel geometry — calm, orderly,
trustworthy-looking. That contrast is the point: the level looks fair, the result sheet tells
you otherwise.

Why this rather than the usual dark-neon rage-game look: the neon/black arcade treatment is
the default for this genre worldwide and communicates nothing about who made this or who it
is for. The exam-sheet concept is specific to the audience, it is instantly legible to them,
and it gives the taunt writing a natural home.

---

## 2. Tokens

### 2.1 Colour

The palette comes from cheap Indian print: duplicating paper, blue ballpoint, red teacher's
pen, marigold, and photocopier black.

| Token | Hex | Role |
|-------|-----|------|
| `--ink` | `#16213A` | Primary text, outlines, UI structure. A ballpoint blue-black, never pure black. |
| `--paper` | `#E4DCC4` | Shell background. Duplicating-paper beige with a green cast — deliberately *not* a warm cream. |
| `--paper-shadow` | `#CFC4A6` | Rules, dividers, inactive states |
| `--red-pen` | `#C41E3A` | Failure, deaths, corrections, spikes. The teacher's pen. |
| `--marigold` | `#F0A202` | Success, coins, progress, the one warm accent |
| `--carbon` | `#0D0B12` | In-level background |
| `--chalk` | `#F5F2E8` | In-level foreground geometry, text on carbon |
| `--saw` | `#7A8BA6` | Hazard metal, secondary in-level |

Rules:
- Two backgrounds, two worlds. Shell = `--paper`. Level = `--carbon`. The transition between
  them is a hard cut, never a gradient.
- `--red-pen` appears **only** for failure and hazards. If it starts appearing on buttons,
  the language is broken.
- No gradients anywhere in the shell. Flat fills and 1px rules only — it is printed paper.
- Contrast: every text pairing must clear 4.5:1. `--ink` on `--paper` is 11.2:1. `--marigold`
  on `--carbon` is 9.1:1. `--marigold` on `--paper` fails and must never be used for text.

### 2.2 Typography

| Role | Family | Notes |
|------|--------|-------|
| Display / headings | **Khand** (700) | An Indian Type Foundry face. Condensed, slightly official, reads as signage — exactly the exam-notice feel. |
| Body / UI | **IBM Plex Sans** (400/600) | Clear at small sizes, wide weight range, free licence. |
| Numerals / results | **IBM Plex Mono** (500) | Death counts, times, ranks. Tabular figures are a functional requirement — numbers that shift width while incrementing look broken. |
| In-level HUD | Khand, or a 8px bitmap face if pixel-perfect rendering demands it | Only used for the timer and the attempt counter |

Scale (1.25 minor third, 16px base):
```
--t-xs: 12.8px   labels, footnotes on the result sheet
--t-sm: 16px     body
--t-md: 20px     emphasis, buttons
--t-lg: 25px     card headings
--t-xl: 39px     screen titles
--t-2xl: 61px    the death number, the one huge element
```

Typographic rules:
- Body line length capped at 68 characters.
- Sentence case throughout. No ALL-CAPS labels — they read as generic UI chrome and fight
  the printed-form concept, which uses sentence case with underlines instead.
- The **death number is the hero** of the game-over screen: `--t-2xl`, mono, `--red-pen`,
  with everything around it small and quiet. Do not add a second large element to compete
  with it.
- All copy is in English.

### 2.3 Space, shape, motion

```
--space: 4 8 12 16 24 32 48 64        (px, 4px base grid)
--radius-0: 0px     everything in the shell — it is paper, paper has corners
--radius-sm: 2px    the single exception: primary buttons, so they read as pressable
--rule: 1px solid var(--ink)          the only border in the system
--rule-dashed: 1px dashed var(--paper-shadow)   tear lines, section splits
```

No box shadows in the shell. Depth, where needed, is a 2px hard offset in `--ink` — a print
misregistration effect, not a soft drop shadow.

**Motion policy.** This game punishes hesitation, so the UI must never make the player wait.
- Respawn: no animation at all. Hard cut. The 400ms budget in `PRD.md` §4.2 is a design
  constraint, not just a technical one.
- Death: one 120ms screen shake plus a red-pen slash drawn across the screen, and that is all.
- Everything else: 150ms `ease-out`, or nothing.
- **One orchestrated moment only** — the chapter-complete result sheet, which types out its
  numbers like a dot-matrix printer over about 800ms. That is the single moment of theatre
  in the product. Everywhere else, motion is instant feedback.
- `prefers-reduced-motion` removes the shake, the printer effect, and all parallax.
  The game must remain fully playable and fully funny without motion.

---

## 3. Screens

### 3.1 Home (platform shell)
The home screen serves N titles from Phase 2 onward, but must not look like a generic portal
grid of identical rounded cards.

```
┌──────────────────────────────────────────┐
│  Just One More         [rank] [profile]  │   ← masthead, ruled underline
├──────────────────────────────────────────┤
│                                          │
│   284,102 people have died so far.       │   ← live global count, mono, large
│   How many times will you?               │
│                                          │
│   ┌──────────────┐  Daily trap           │
│   │  [ Play ]    │  Level 47 · 3-day     │   ← primary CTA, the only filled button
│   └──────────────┘  streak               │
│                                          │
├─ - - - - - - - - - - - - - - - - - - - ─┤   ← tear line
│  More games                              │
│  01  Push Party      4–8 players         │   ← a numbered list, because these
│  02  Draw and Guess  3–12 players        │     genuinely are a ranked slate
│  03  Trivia War      1v1                 │
└──────────────────────────────────────────┘
```
The live death counter is the hero. It is the most characteristic thing about the product,
it updates in real time, and it makes the scale of shared failure immediately legible.

### 3.2 Level select — the notice board
A ruled list, not a grid of cards. Each row: level number, name, your death count, the global
median death count. Seeing that everyone else also died 14 times on Level 7 is the retention
mechanic. Locked levels are printed but struck through.

### 3.3 In-level HUD
Almost nothing. Attempt number top-left in mono, timer top-right if the level has one. No
pause button on mobile (accidental taps kill runs); pause is the browser back gesture or the
Escape key. Nothing else on screen.

### 3.4 Death overlay
Appears and dismisses within the 400ms respawn budget, so it overlaps the respawn rather
than blocking it:
- Red-pen slash animation, 120ms
- Attempt number increments, mono, visible
- One taunt line, `--t-md`, Khand, positioned consistently so the eye finds it without searching
- No buttons. No "retry?" confirmation. The player is already respawned.

### 3.5 Level complete — the result slip
The one moment of theatre. A printed slip with: level name, attempts taken, time, your rank
among all players on that level, and one line of grudging praise that is really still an
insult. A single share affordance, and a continue button. The share button is the second
most important pixel in the product after the play button — it gets the marigold.

### 3.6 Share card (9:16, for Reels/WhatsApp)
Generated as an image or burned into the clip:
- Top: level name and "I died here 23 times"
- Middle: the clip / the moment of death
- Bottom: death count in huge mono, plus the challenge URL
Designed to be legible as a thumbnail at 120px wide, because that is how it will be seen.

### 3.7 Meta-trap fakes
Levels 8, 15, and 24 imitate the real loading, level-complete, and error screens. Those fakes
must be **pixel-identical** to the real thing — a fake that looks slightly off is just a bug.
This means the real loading and completion screens must be committed to and frozen before
those levels are authored. Note the hard constraints in `SECURITY.md` §9: never fake anything
resembling a credential, permission, payment, or browser security prompt.

---

## 4. Voice and copy

The game's voice is **a sarcastic invigilator**: formal register, informal content, never
actually cruel about who you are.

Principles:
- Mock the situation and the performance, never the person's identity, family in any genuine
  register, appearance, caste, religion, or ability. `SECURITY.md` §6 makes this a gated
  review process, not a matter of taste.
- Sentence case, no exclamation marks in system copy — the deadpan is funnier.
- Buttons say what happens: "Play", "Share", "Try again". Never "Submit", never "OK".
- Empty and error states give direction in the interface's voice, and are never confused
  with meta-traps. A real error says plainly what broke and what to do.

Taunt bank structure (`taunts` table, `TECH_STACK.md` §7): each line has a weight, a tag
(`early`, `repeated-death`, `close-to-goal`, `stupid-death`), and a locale. Context-matched
taunts land far harder than random ones — dying one pixel from the door should produce a
different line than dying at spawn.

Seed lines by tag:
- `early`: "already? on the first level?", "that wasn't even the warm-up"
- `repeated-death`: "17 times. impressive.", "maybe watch a tutorial"
- `close-to-goal`: "so close. so far.", "the door was laughing at you"
- `stupid-death`: "you could see that one coming", "you chose that, all by yourself"

---

## 5. Accessibility

Rage-by-design is not an excuse for exclusion. Difficulty must come from the traps, never
from the interface.

- All text clears WCAG AA contrast. Hazards are never identified by colour alone — spikes
  and saws have distinct silhouettes.
- Full keyboard operability across the shell, with visible focus rings (2px `--red-pen`
  offset, which is the one place red appears outside failure, and it is thematically apt).
- `prefers-reduced-motion` respected fully, as in §2.3.
- Touch targets minimum 44×44px in the shell. In-level touch zones are half-screen, so they
  always clear this.
- Screen reader: the shell is fully navigable. The level itself is not screen-reader playable
  and that limitation is stated honestly rather than faked with useless ARIA.
- No flashing above 3Hz anywhere. The death slash and screen shake must be checked against
  photosensitivity guidance.
- Colour-blind check: `--red-pen` vs `--marigold` on `--carbon` is the risky pairing.
  Verify under deuteranopia and protanopia simulation; differentiate by shape if it fails.

---

## 6. Asset specification (2D)

| Asset | Spec |
|-------|------|
| Tile grid | 16×16px base, rendered at 2x or 3x integer scale only |
| Character | 12×16px, 4-frame run, 1-frame jump, 1-frame fall, 6-frame death |
| Traps | 16×16 or 32×32, silhouette-distinct at 1x |
| Atlas | Single sprite atlas per chapter, max 1024×1024, WebP with PNG fallback |
| Rendering | **Changed 2026-09-24:** in-level is now 3D, stylised realistic (lit concrete, metal, soft shadows) with 2D movement. The shell keeps the paper look. |
| Audio | One audio sprite sheet (`.webm` + `.m4a`), total under 400KB |
| Fonts | Subset to Latin, WOFF2, under 40KB each, `font-display: swap` |

Integer scaling is non-negotiable. A half-pixel offset in a precision platformer produces
deaths the player cannot explain, which breaks the legibility rule in `PRD.md` §4.1 — the
one rule the whole design depends on.

---

## 7. Sound design

Short, dry, and punchy. Sound carries a large part of the comedy.
- Jump: a small, unremarkable blip.
- Death: a single abrupt cut-off sound, not a long stinger. Length matters more than
  character — a long death sound makes the 400ms respawn feel slow.
- Trap spring: the *only* sound with any drama. It should make the player flinch.
- Level complete: a two-note figure, deliberately underwhelming.
- No background music during levels. Silence makes the trap sounds land and keeps the audio
  budget small. The shell gets a loop; the level does not.
- Everything mutable, and muted by default if the browser blocks autoplay — never prompt
  for audio permission.

---

## 8. Phase-wise design tasks

### Phase 0 — Foundation
- [ ] Token file (`packages/ui/tokens.css`) with all colour, type, space, radius values from §2
- [ ] Tailwind preset consuming those tokens — one source of truth, no hardcoded hex anywhere
- [ ] Font subsetting pipeline and self-hosted WOFF2 files
- [ ] Contrast audit of every token pairing, recorded in the repo
- [ ] A one-page token specimen route for visual reference

### Phase 1 — MVP core loop
- [ ] Character sprite: run, jump, fall, death
- [ ] Trap sprites: collapse tile, spike, saw, door
- [ ] Chapter 1 tile set
- [ ] Death overlay: slash, attempt counter, taunt slot
- [ ] In-level HUD
- [ ] Touch control zones with a visual first-run hint that appears once
- [ ] Core sounds: jump, death, trap spring, complete
- [ ] Reduced-motion variants of every animation built at the same time as the animation

### Phase 2 — Chapter 1 + shell
- [ ] Home screen with the live death counter as hero
- [ ] Level select notice board with personal vs global death counts
- [ ] Result slip screen with the dot-matrix print moment
- [ ] Auth screens (magic link / Google), styled as the same printed form
- [ ] Empty, loading, and real error states — written and designed properly, because the
      meta-traps in Phase 4 will copy them exactly
- [ ] Responsive audit: 320px portrait through 1440px desktop
- [ ] Keyboard focus states across the whole shell

### Phase 3 — Viral layer
- [ ] 9:16 share card template, thumbnail-legible at 120px
- [ ] Clip overlay branding, burned in, not a watermark corner
- [ ] OG image template for challenge links, including the friend's attempt count
- [ ] Rage meter visualisation — resist making it a gauge; a printed "rage score" line
      on the result slip fits the concept better
- [ ] Share button hierarchy on the result slip

### Phase 4 — Chapters 2–3 + retention
- [ ] Chapter 2 and 3 tile sets, visually distinct but within the same palette
- [ ] Darkness/lighting treatment for Level 16
- [ ] Ghost rendering style (translucent chalk, clearly not the player)
- [ ] Taunt-as-platform typography for Level 21 — the type is physically load-bearing here,
      which needs a bespoke treatment
- [ ] **Freeze the real loading/complete/error screens**, then build pixel-identical fakes
- [ ] Daily Trap and streak visualisation
- [ ] Leaderboard as a printed rank list

### Phase 5 — Multiplayer + title #2
- [ ] Player colour identity system: four colours that survive the colour-blind check
- [ ] Room lobby screen, joinable-by-link, shows who has arrived
- [ ] Race position indicator
- [ ] Sabotage trap-placement UI — must be legible to a player who is also watching the runner
- [ ] Emote set (§5 of `SECURITY.md` — no free text), 8 emotes, silhouette-distinct
- [ ] Push Party visual identity: same tokens, different tile language

### Phase 6 — 3D + scale
- [ ] 3D mode art direction, reconciled with the 2D palette (see `3D_MODELING.md`)
- [ ] Mode-switch transition between 2D and 3D worlds
- [ ] PWA icons, splash screens, install prompt styling
- [ ] Full design-system documentation pass for contributors

---

## 9. Design review checklist

Run before shipping any screen:
1. Does it use only the tokens in §2? Any hardcoded colour is a bug.
2. Is there exactly one focal element? If two things compete, cut one.
3. Does any motion delay the player's next input? If yes, remove it.
4. Does it read correctly at 320px wide?
5. Does it still work with motion disabled and audio off?
6. Would it survive being screenshotted at 120px in a WhatsApp preview?
7. Is red used for anything other than failure or hazard? If yes, fix it.
8. If this screen might be faked by a meta-trap later, is it frozen and documented?
