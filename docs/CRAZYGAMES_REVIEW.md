# Just One More — CrazyGames pre-submission review

Reviewed 4 October 2026. Target: **Basic Launch, single-player edition**. Upload `apps/web/dist/just-one-more-crazygames.zip`, which has `index.html` at its root. Upload the `-v2` files in `apps/web/crazygames/submission/` separately as portal covers and previews.

## Player review

I get straight into the first course. The little runner, concrete slabs and red hazards make the objective clear without an opening menu. Movement starts immediately, a death restarts quickly, and the attempt counter gives the failure a good comic sting. Pause, sound, and the later hint/“Watch how” help are useful when the trap stops feeling obvious. The 3D treatment gives the simple platform layout some character.

The rough edge is readability: in a narrow portrait view the course still occupies a strip near the bottom. I enlarged the camera framing and gave the opening control hint an opaque background, which made the runner and text clearer at 907 × 510. The early “Watch how” flow is a valuable safety net, particularly for the late courses. This is a **first-course hands-on review plus automated replay audit of all 40 levels**, not a claim that a person manually beat all 40 in one sitting. My provisional player score is **7/10**: a strong instant-retry hook, with portrait composition and late-level fairness as the main polish targets.

## What was tested and fixed

| Area | Result |
| --- | --- |
| Instant start | Standalone build opens in playable level 1 without a menu or account gate. |
| Desktop and mobile layout | Checked live at 907 × 510 and 390 × 844. HUD, pause, and touch zones fit; safe-area padding and portrait camera are included. The keyboard hint is hidden at phone widths so it cannot overlap touch controls. |
| Keyboard, mouse and touch | Keyboard movement, jump, pause and restart checked locally; mouse and touch zones use the same input path. A physical iOS/Android device was not available for this pass. |
| Level progression | 40 levels, including variant attempt recordings, have zero-death deterministic solution replays. `@jom/game-rage` has 208 passing tests. The level-40 final route was repaired and its recordings updated. |
| Challenge/daily/party | Web tests pass; 60 generated daily challenges clear; 20-room realtime load test passed. The CrazyGames build deliberately offers the standalone single-player title, so no server or friend flow is exposed there. |
| SDK | Basic Launch lifecycle reports loading and gameplay transitions when the official SDK is available; loading continues if its script is blocked. Host mute preference is read at playback time. Mock lifecycle tests pass. |
| Ads and links | No ad or reward CTA, other-game promotions, external game link, or in-game fullscreen control in the portal UI. |
| Packaging | Relative asset paths; 12 files; under 1 MB uncompressed. ZIP integrity checked. This is far under CrazyGames' 20 MB mobile-homepage initial budget, 250 MB total limit and 1,500-file limit. |
| Build quality | Full `pnpm verify` passes, including all 10 packages' typecheck, lint and tests, the Next production build and bundle check. The standalone Vite build also passes. |

The unshipped Phase 6 `@jom/game-3d` climb prototype had a failing no-death route test. Moving its spike away from the landing, handling its vertical elevator correctly and checking the actual 32 m summit fixed it; the full repository check is now green.

Moving level 21's hidden spike away from the landing improved its recorded route from 8% to **69% survival under ±2-frame timing perturbations**. Level 40's recorded routes survive 20% and 16% on attempts one and two; those figures measure the demonstrations' tolerance, not actual player completion rates. Its long finale warrants additional human playtesting before a Full Launch quality review.

## CrazyGames submission check

This build is prepared for **Basic Launch**. CrazyGames evaluates game quality and performance in its own portal, so local checks cannot guarantee acceptance. Use the Developer Portal's QA preview before pressing Submit, especially to check the SDK event trace, Chrome/Edge, a real phone, and iframe focus. The portal preview is the final environment check.

Use `cover-landscape-v2.png` (1920 × 1080), `cover-portrait-v2.png` (800 × 1200), and `cover-square-v2.png` (800 × 800). They show the runner, spikes and saw with the exact game title. They were made with the built-in image generator using the prompt set “3D platform game artwork, mustard-hooded runner jumping over red spikes toward a circular saw, navy backdrop, no text,” then the exact title was overlaid. These are illustrative promotional art; the footage that follows shows the actual game. Use `preview-landscape-v2.mp4` and `preview-portrait-v2.mp4`: silent ~15-second H.264 videos in 16:9 and 2:3, each opening with its corresponding cover, followed by direct capture of the game's recorded level-31 route.

Suggested portal description: “Run, jump and restart through 40 trap-filled platform levels. The course remembers your attempts, and every failure is one more reason to try again.”

Suggested controls: “Left/Right or A/D: move. Space, Up or W: jump. P: pause. R: restart. On touchscreens, use the on-screen Left, Right and Jump zones.”

For **Full Launch**, additional work is required: CrazyGames account-linked progress, applicable user identity, the full SDK integration and ad flow if monetized, and CrazyGames friend/room integration if the multiplayer edition is offered. The current ZIP should be submitted as a single-player Basic Launch game, without claiming those Full Launch features.

Build the upload ZIP again with `pnpm --filter @jom/web package:crazygames`. Preview locally with `pnpm --filter @jom/web preview:crazygames` and open `http://127.0.0.1:4173/`. The source `apps/web/crazygames/index.html` is a Vite entrypoint; opening that source file with `file://` does not run the compiled game.

References: [technical](https://docs.crazygames.com/requirements/technical/), [gameplay](https://docs.crazygames.com/requirements/gameplay/), [ads](https://docs.crazygames.com/requirements/ads/), [launch stages](https://docs.crazygames.com/requirements/intro/), [covers and previews](https://docs.crazygames.com/requirements/game-covers/), [multiplayer](https://docs.crazygames.com/requirements/multiplayer/).
