# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary audience is 16–26-year-old players in India using Android phones and budget
laptops in short, shareable play sessions. A secondary audience is the global rage-game
community. The shell is English-only.

## Product Purpose

Just One More is a browser-first, mobile-friendly multi-game platform. Its flagship rage
platformer turns short, legible betrayals into rapid retries and shareable failures. Success
means players understand each death in hindsight, retry immediately, and return for more than
one game title.

## Positioning

The flagship game presents levels that look fair, then breaks a specific assumption the player
has formed. Failures must feel surprising but explainable. The platform voice treats each death
like an exam result delivered by a sarcastic invigilator.

## Operating Context

Most sessions happen on mobile portrait devices over metered 4G, with desktop keyboard play as
a first-class path. Players use touch zones or Arrow/WASD plus Space, retry without dialogs, and
may enter private party rooms through a shared link.

## Capabilities and Constraints

- The initial load budget is 3 MB; the 3D renderer must remain lazy and must not penalize shell
  or 2D-only loads.
- Respawn must complete in under 400 ms; input latency must stay at or below 50 ms.
- Every solved level must be completable in under 20 seconds, and no level should exceed ten
  deaths at p50.
- The current product includes the rage platformer, Push Party, level selection, local progress,
  a daily trap, and private-room entry. Global death counts and clip sharing are planned, not
  current proof.
- Real-money gaming, native mobile apps, user-generated levels, and voice chat are out of scope.

## Brand Commitments

The product name is Just One More. Its voice is a sarcastic invigilator: formal register,
deadpan jokes, no cruelty toward identity or ability, and no exclamation marks in system copy.
The user explicitly requested a more interactive 3D presentation using Blender-rendered work;
the established shell/game split remains binding.

## Evidence on Hand

Product requirements, targets, and level specifications are recorded in `docs/PRD.md`. The
established interface identity is recorded in `docs/DESIGNING.md`. The repository contains a
procedurally generated Blender home diorama, a lazy Three.js game renderer, deterministic level
tests, and local progress data. No global death-count evidence or testimonials are present and
must not be fabricated.

## Product Principles

- Every trap is surprising before death and understandable after it.
- Retrying is instant; interface theatre never delays play.
- Failure is funny because of the situation, never because of who the player is.
- The shell supports multiple titles without becoming a generic card portal.
- Visual richness must stay within the performance reality of low-end mobile devices.

## Accessibility & Inclusion

Shell text must meet WCAG AA contrast, keyboard focus must remain visible, touch targets are at
least 44 px, hazards need shape cues in addition to colour, and reduced-motion users receive the
same information without parallax, shake, or looping animation. The level itself is not claimed
to be screen-reader playable.
