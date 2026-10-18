# Design — Just One More

The implementation contract for the visual system. [`docs/DESIGNING.md`](docs/DESIGNING.md)
remains the source for rationale, voice and the meta-trap rules. Where the two differ, this
file records the user's later decision.

## Creative North Star: the invigilator's desk

The shell is a dark exam-hall desk at night. Everything official arrives as a paper slip laid
on it: the level register, the room register, the daily form, a challenge, pause and results.
The level is the exam paper, and every failure is corrected in red pen.

**User decision (2026-10-18):** the desk replaces DESIGNING.md's all-paper shell. Paper now
appears only as slips on the desk. The in-level stage stays dark.

## Named rules

1. **Red pen marks failure, and only failure.** Deaths, hazards, corrections. It never appears on
   a button, and backdrops stay free of red.
2. **Paper is handed out, never painted.** Paper is a discrete slip on the desk, never a page
   background.
3. **The number is the hero.** On every result surface the death count is the one huge element
   (61px mono, red pen on paper, `desk-fail` on the desk). Nothing competes with it.
4. **Deaths are counted, not drawn.** Only the attempt number records a death. Nothing covers the
   course or the top edge (user decision 2026-10-18: no death slash, no ✗ marks, no progress
   ruler).

## Tokens

All colours come from `packages/ui/src/tokens.ts` (run `pnpm --filter @jom/ui generate` after an
edit). Every pairing is in `PAIRINGS` and passes its WCAG threshold.

| Role                | Token                      | Use                                              |
| ------------------- | -------------------------- | ------------------------------------------------ |
| Desk                | `desk`                     | Page ground for every shell page                 |
| Desk, raised / deep | `desk-raised`, `desk-deep` | Panels; the hard offset under slips              |
| Text on the desk    | `desk-ink`, `desk-muted`   | Body; mono captions and microcopy                |
| Rules on the desk   | `desk-line`                | Hairlines and outlines (non-text)                |
| Go                  | `go`                       | The one filled button on the desk, the hero line |
| Failure on the desk | `desk-fail`                | Death counts and focus rings on the desk         |
| Slip                | `paper`, `ink`             | Every slip; `btn-ink` is the slip's primary      |
| Failure on paper    | `red-pen`                  | Large text and non-text only (4.27:1)            |
| Success on paper    | `marigold`                 | Fills only (share button, "up next" bar)         |

## Shared system (`apps/web/app/desk.css`, `globals.css`)

- Type: Khand 700 display, IBM Plex Sans body, IBM Plex Mono 500 data (tabular figures). Extreme
  scale contrast: display 56–150px against 12–19px text. Nothing below 12px. Sentence case only.
- Components:
  - `Masthead`: wordmark, All levels, Play with friends, wallet. Hidden while the wallet is zero.
  - `.btn-go`: lime on the desk. `.btn-ink`: ink on paper. These two primaries are the only
    rounded corners (2px). `.btn-line` and text links for everything else.
  - `.slip`: paper, square corners, a dashed perforation under the top edge, and a hard 6px
    offset in `desk-deep` (print misregistration, never a soft shadow). `.slip-head` carries the
    form number in mono ("Form D / Daily examination").
  - `.stamp`: a crooked sentence-case rubber stamp (Passed, Up next, Locked).
- Motion: 150ms ease-out for state; the 0.12s death shake; a ≤ 420ms line-by-line print of the
  result slip; the attempt number ticks over. Reduced motion removes all of them, the figure's
  tilt and the level-start pan, and keeps every piece of information.
- Focus: 2px outline, red pen on paper, `desk-fail` on the desk.

## Pages

| Page            | First viewport                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home            | "A game that lies to you." with Play (or "Continue level N" plus the player's death line), beside Fig. 01: the Blender diorama of a level as an exam paper. Below: the Daily and party forms as slips, then the title register. |
| Levels          | "All levels", the record line (passed, deaths) and Continue; then one result-sheet slip per chapter with a stamp per level.                                                                                                     |
| Party           | One room-register slip on the desk.                                                                                                                                                                                             |
| Challenge       | One slip: the friend's death count as the hero, then "Play level N".                                                                                                                                                            |
| CrazyGames home | The web home without party or outbound links.                                                                                                                                                                                   |
| In-level        | The stage owns the viewport. HUD: level, a big attempt counter, sound, pause. Menus are printed slips.                                                                                                                          |

## The stage (`packages/game-rage/src/render.ts`)

- Camera: 8 units of height in view, with a look-ahead of 28% of the half-width in the direction
  of travel, so the runner is bigger without seeing less of what is coming.
- On a level's first visit the camera holds on the far end, then pans back to the runner (about
  1.5s). Any movement cancels it. It is skipped on Small World (the fake end), dark levels and Spin.
- Backdrops: one room per chapter, 18 units behind the course, faded into the sky at the top and
  dimmed so the course always reads first. Hidden on dark levels.
  - Chapter 1: the exam hall.
  - Chapter 2: the corridor.
  - Chapter 3: the results wall.
  - Chapter 4: the hall after the exam, at night.

## Art pipeline (Blender, `tooling/blender/`)

Scripts build every scene from primitives and read colours from `tokens.ts` (`jom.py`), so a
token change re-colours the art. Run with
`/Applications/Blender.app/Contents/MacOS/Blender -b --python tooling/blender/<script>.py`.

| Script            | Output                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `home_diorama.py` | `apps/web/app/art/home-diorama{,-800}.webp` (Fig. 01)                                                                                  |
| `backdrops.py`    | `packages/game-rage/assets/backdrop-ch{1..4}.webp` (seamless 16-unit tiles: orthographic camera, sun light, the bay built three times) |

Assets are referenced with `new URL('…', import.meta.url)`, which works in both the Next.js build
and the CrazyGames Vite build (relative paths).

## Responsive and access

- No horizontal scrolling at 320, 375, 414 and 768px; tap targets ≥ 44px; nothing depends on hover
  ("Click to play" becomes "Tap to play" on touch).
- Text pairs ≥ 4.5:1, large text and non-text ≥ 3:1 (`packages/ui/CONTRAST.md`).
- Difficulty belongs to traps, never to illegible UI or ambiguous hitboxes.

## Decisions log

| Decision                                       | Status         | Note                                                         |
| ---------------------------------------------- | -------------- | ------------------------------------------------------------ |
| Invigilator's desk shell                       | Locked         | User choice, 2026-10-18                                      |
| All-paper shell (2026-10-14 pass)              | Tried, removed | Replaced by the desk; levels/party converted to slips        |
| Periwinkle party block (`home-party`)          | Tried, removed | A third accent; the party form is now a slip                 |
| Paper-sheet diorama with blocks (2026-10-14)   | Tried, removed | No course or runner; replaced by Fig. 01                     |
| Backdrop 9 units behind, full height           | Tried, removed | Windows filled 40% of the frame and competed with the course |
| Blender backdrops, 18 units back, 14-unit tile | Shipped        |                                                              |
| Red-pen death slash and ✗ death marks          | Tried, removed | User asked to remove both, 2026-10-18                        |
| Progress ruler with death ticks                | Tried, removed | User asked to remove it, 2026-10-18                          |
