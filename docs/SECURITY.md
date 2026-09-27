# SECURITY.md — "Just One More"

**Related docs:** `PRD.md`, `TECH_STACK.md`, `DESIGNING.md`, `3D_MODELING.md`

---

## 1. Threat model

Be honest about what this product actually attracts. It is a free browser game with
leaderboards, user-uploaded clips, and multiplayer rooms. That produces a specific,
predictable set of attackers.

| # | Threat | Likelihood | Impact | Priority |
|---|--------|-----------|--------|----------|
| T1 | Leaderboard forgery (fake times, impossible clears) | Very high | Medium — destroys competitive trust | P0 |
| T2 | Automated abuse: bot accounts, scripted clears, counter inflation | High | Medium | P0 |
| T3 | Abusive/illegal content in handles, or uploaded clips of something other than gameplay | High | High — legal exposure in India | P0 |
| T4 | Client tampering: modified game JS, memory editing, injected inputs | Very high | Low–Medium | P1 |
| T5 | XSS via user handles, taunt admin, or chat | Medium | High — session theft | P0 |
| T6 | Credential stuffing on accounts | Medium | Medium | P1 |
| T7 | Cost-based DoS: clip upload spam, room spam, expensive API loops | Medium | High — a solo-run project can be bankrupted by an egress bill | P0 |
| T8 | Multiplayer griefing: room hijack, disconnect abuse, trap spam in Sabotage | High | Medium | P1 |
| T9 | Personal data mishandling (minors, DPDP Act) | Medium | Very high — regulatory | P0 |
| T10 | Supply chain: compromised npm dependency | Low | Very high | P1 |
| T11 | Secrets leaked via client bundle or repo | Medium | Very high | P0 |

**Explicitly accepted risk:** a determined player will always be able to cheat a
single-player time on a client-rendered web game. The goal is not to make it impossible;
it is to make it expensive enough that the leaderboard stays credible, and to keep verified
and unverified runs visibly separate.

**Explicitly out of scope:** real-money transactions, payment data, KYC. The product does
not handle money in v1 (`PRD.md` §2), which removes an enormous compliance surface. If
monetisation is ever added, this document must be rewritten before a single line is coded.

---

## 2. Secrets and configuration

- No secret ever enters the repo. `.env.example` documents keys with placeholder values only.
- Anything referenced in client code is public by definition. `NEXT_PUBLIC_*` prefix is
  mandatory for those, and CI greps for any non-prefixed secret name appearing in the
  client bundle.
- Secrets live in Vercel/Railway environment settings, distinct values per environment.
- Rotation: quarterly, and immediately on any contributor offboarding.
- `gitleaks` runs in CI on every PR and blocks on any finding.
- Supabase `service_role` key is server-only, never imported into `apps/web/app` client
  components. Enforce with an eslint `no-restricted-imports` rule.

---

## 3. Authentication and sessions

**Design:** anonymous-first. A player gets a signed anonymous session on first load and can
play the entire single-player game without an account. Account creation is prompted at
Level 10, and the upgrade preserves all progress.

- Anonymous session = HTTP-only, `Secure`, `SameSite=Lax` cookie holding a signed opaque ID.
  No game state in the cookie.
- Account auth via Supabase Auth: email magic link + Google OAuth. **No password auth in v1**
  — that removes credential stuffing (T6), password reset flows, and password storage risk
  in one decision.
- Session lifetime: 30 days sliding for accounts, 90 days for anonymous. Refresh rotates the token.
- On account upgrade, the anonymous ID is merged and then invalidated, never left usable.
- Rate limit auth endpoints: 5 requests per 15 minutes per IP and per email, Redis-backed.
- Never leak account existence in auth responses. Same message and same response timing
  whether or not the email is registered.

### Authorization
- Row Level Security enabled on every Supabase table. Default deny.
- A user can read and write only their own `progress`, `attempts`, `clips`, `wallet` rows.
- Leaderboards are read via a `SECURITY DEFINER` view that exposes handle + score only —
  never `user_id`, never email, never region.
- All admin surfaces (taunt editor, level flags, moderation queue) sit behind a separate
  role check plus a second factor, and are on a distinct route prefix excluded from the
  public sitemap.

---

## 4. Anti-cheat (T1, T2, T4)

The determinism work in `TECH_STACK.md` §5 is the foundation of this entire section. It is
what makes cheap server-side verification possible at all.

### 4.1 Tiered verification
| Tier | Applies to | Verification |
|------|-----------|--------------|
| 0 — Unverified | Casual play, personal progress | None. Trust the client. It costs nothing if someone lies to themselves. |
| 1 — Sanity-checked | All submitted times | Server rejects times below a per-level floor, deaths that don't match frames, timestamps out of order |
| 2 — Replay-verified | Top 100 per level, all Daily Trap results | Server re-simulates the submitted input log headlessly and confirms the outcome and frame count |
| 3 — Flagged review | Statistical outliers | Manual, plus automatic shadow-exclusion from public boards |

Only Tier 2 runs get a "verified" badge. The leaderboard shows verified and unverified
separately. This is more honest than pretending everything is checked, and it means a
cheater's reward is a visibly asterisked entry.

### 4.2 Replay verification implementation
- Client submits `{ levelId, seed, inputLog, claimedFrames, claimedOutcome, clientVersion }`.
- Server runs the identical `packages/engine` simulation in a Node worker with a hard
  200ms CPU timeout and a frame cap.
- Mismatch in outcome or frame count ⇒ reject and increment a per-user suspicion score.
- The simulation is the same package as the client, so verification can never drift from
  gameplay. There is exactly one implementation of the rules.
- Input log sanity before simulating: reject logs with superhuman input density
  (>20 state changes/sec sustained), frames out of order, or length mismatched to claim.

### 4.3 Server-side floors
- Per level, store the theoretical minimum clear time from a developer-recorded optimal run.
  Reject anything under 85% of it outright.
- Death counters use `INCR` on a key derived from the session, rate-limited to one increment
  per 500ms per session. A death every 200ms is a script.
- Daily Trap accepts exactly one scored submission per user per day, enforced by a unique
  constraint, not by application logic alone.

### 4.4 Client hardening (deterrent only, never relied upon)
- Minify and mangle production bundles; no source maps in production.
- Do not expose the game instance on `window`.
- Basic integrity check: hash of the level JSON is included in submissions; a mismatch flags
  the run. Treat this as a speed bump, not a control.
- **Do not build client-side anti-debug, obfuscation loops, or tamper alarms.** They hurt
  legitimate low-end users, bloat the bundle against the 3MB budget, and stop nobody serious.

---

## 5. Multiplayer security (T8)

- **Server authoritative.** The Colyseus room owns all game state. Clients send inputs,
  never positions, never "I won" messages.
- Client prediction is presentation only; the server snapshot always wins reconciliation.
- Input validation per tick: reject physically impossible input sequences, cap input rate.
- Sabotage Mode trap placement: server validates budget, cooldown, and legal position.
  A saboteur must not be able to place a trap that makes the level unwinnable — encode
  that as a solvability check, not a trust assumption.
- Room codes: 6 characters from an unambiguous alphabet, cryptographically random, with a
  1,000 guesses/hour/IP rate limit. Rooms expire 10 minutes after becoming empty.
- Disconnect abuse: leaving mid-race records a loss. Reconnect grace is 15 seconds.
- Cap rooms per IP (5 concurrent) and room creations per session (20/hour) to blunt T7.
- No free-text chat in v1. Communication is limited to a fixed emote set. This removes the
  entire chat moderation problem, which is not one a small team should take on early.

---

## 6. User-generated content (T3)

Clips are the highest-risk feature in the product. A share button plus a camera-adjacent
API is an invitation for people to upload things that are not gameplay.

### Controls
1. **Clips are generated, not uploaded.** The client captures the game canvas only, never
   `getUserMedia`, never the screen, never a file picker. There is no code path by which a
   user file becomes a clip. This single decision removes most of the risk.
2. Uploads go to R2 via short-lived presigned URLs, scoped to one key, with a 15MB size cap
   and a strict content-type allowlist (`video/webm`, `video/mp4`).
3. Server verifies the stored object's magic bytes match the declared type before the clip
   becomes shareable.
4. Rate limit: 10 clip uploads per user per hour, 50 per day.
5. Clips default to **unlisted**. Public gallery listing, if ever built, requires review.
6. Every clip is attributable to a session and IP, retained for 90 days for abuse response.
7. Takedown path: a reachable contact route and a documented 72-hour response commitment.

### Handles and any free text
- Handles: 3–16 characters, `[a-zA-Z0-9_]` only, no Unicode confusables, no leading/trailing
  separators.
- Denylist covering English and Hindi/Hinglish slurs and impersonation patterns
  (`admin`, `official`, etc.). Maintain it in the database, not the bundle.
- Handles are render-escaped everywhere, including inside generated OG images and clip overlays.
- Reserved-name list for the brand.

### The taunt system is content too
Taunts ship *with* the product and carry the brand's voice, so they need an editorial gate:
- Every taunt reviewed before enabling. No auto-generation into production.
- Insulting the *situation*, never the player's identity. Nothing touching family in a
  genuinely abusive register, caste, religion, gender, appearance, or ability. "Maybe watch a
  tutorial" is fine; the line is crossed the moment a taunt could land as a real slur.
- A global kill switch to disable any taunt without a deploy.

---

## 7. Application security (T5, T7, T10, T11)

### Input handling
- Every API boundary validates with **Zod**. No request body is trusted, including from
  our own client.
- Parameterised queries only, via the ORM. No string-concatenated SQL anywhere.
- Level JSON from the server is validated against the schema client-side too — a compromised
  CDN response should not be able to execute anything.

### Headers and browser policy
```
Content-Security-Policy: default-src 'self';
  script-src 'self';                      # no unsafe-inline, no unsafe-eval
  style-src 'self' 'unsafe-inline';       # Tailwind runtime; tighten with nonces when feasible
  img-src 'self' data: blob: https://<r2-domain>;
  media-src 'self' blob: https://<r2-domain>;
  connect-src 'self' https://<supabase> https://<posthog> wss://<colyseus>;
  frame-ancestors 'none'; base-uri 'self'; object-src 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```
Note: `ffmpeg.wasm` needs `wasm-unsafe-eval` and cross-origin isolation headers. Scope
those to the clip worker's route only — do not weaken the global policy for it.

### Rate limiting (T7 — treat cost as a security property)
| Endpoint class | Limit |
|---|---|
| Auth | 5 / 15 min / IP + email |
| Score submission | 60 / hour / user |
| Clip upload | 10 / hour, 50 / day / user |
| Room create | 20 / hour / session, 5 concurrent / IP |
| Leaderboard read | 120 / min / IP, cached 30s at the edge |
| Everything else | 300 / min / IP |

Plus: hard spend caps and billing alerts on R2, Vercel, and Upstash. Choose R2 specifically
because zero egress fees make the clip feature's worst case survivable.

### Dependencies
- Lockfile committed; `pnpm audit` and Dependabot in CI, high/critical blocks the merge.
- Pin exact versions for anything touching the sim or crypto.
- Review any new dependency's weekly downloads, maintenance, and transitive count before adding.
- No dependency gets added for something under ~50 lines of code.

### Logging
- Structured JSON logs, correlation ID per request.
- **Never log:** tokens, session cookies, email addresses in full, raw IP beyond the 90-day
  abuse window, or input logs tied to an identified user beyond verification.
- Sentry with PII scrubbing on, and `sendDefaultPii: false`.

---

## 8. Privacy and Indian regulatory posture (T9)

The **Digital Personal Data Protection Act, 2023** governs this product, and a casual game
with a young audience is squarely in its sensitive zone. The single most important
consequence: DPDP requires verifiable parental consent for users under 18, and bars
behavioural advertising and tracking directed at children.

### Practical stance
1. **Collect the minimum.** Handle, email (only if the user makes an account), progress,
   coarse region. No phone number, no date of birth beyond an age gate, no contacts, no
   precise location, no device fingerprinting.
2. **Age gate, not age collection.** A neutral "are you 18 or over?" gate at *account
   creation only*, not at play. Store the boolean result, not a birth date.
3. **Under-18 accounts:** no public leaderboard handle by default, no public clip listing,
   no behavioural analytics, no retargeting pixels, ever. If verifiable parental consent
   cannot be implemented properly, under-18 users stay anonymous-only — which the
   anonymous-first design already supports fully.
4. **No third-party ad SDKs in v1.** This is a product decision with a privacy dividend.
5. **Analytics:** PostHog configured with IP anonymisation and no session recording on
   under-18 or unauthenticated sessions.
6. **Rights:** export and delete endpoints for account data, fulfilled within 30 days.
   Deletion cascades to clips in R2 and to Redis leaderboard entries.
7. **Retention:** attempts 180 days, clips 365 days or until deleted, abuse logs 90 days,
   analytics 24 months aggregated.
8. Privacy policy and terms published before the first public link is shared, written in
   plain language, not boilerplate.

I'm describing a reasonable engineering posture here, not giving legal advice — before
public launch, and certainly before any monetisation, get an Indian lawyer to review the
DPDP position and the terms, particularly around minors.

---

## 9. Meta-traps: a specific safety rule

Levels 8, 15, and 24 deliberately fake UI states (loading, level-complete, crash). This is
a genuine safety concern, not just a UX one.

**Hard rules, non-negotiable:**
- Fake states live in a namespaced subsystem (`metaTrap/*`) that has no access to and no
  relationship with real error handling, auth flows, or payment-adjacent UI.
- A fake state is always dismissible by any input within 3 seconds.
- Never show a fake error to a user who has had a real Sentry-reported error in the last
  10 minutes.
- Never fake anything resembling a security prompt, a login screen, a permission dialog, a
  payment screen, a browser warning, or an OS-level message. Faking loading and level-complete
  is a joke; faking a credential prompt trains users to be phished.
- Never fake a state on a user's first session.
- These rules are enforced by tests, not by memory.

---

## 10. Incident response

| Severity | Definition | Response |
|----------|-----------|----------|
| SEV1 | Data exposure, auth bypass, illegal content live | Immediate: take the feature down, then investigate |
| SEV2 | Leaderboard integrity broken, widespread cheating | Freeze boards, verify, restore from snapshot |
| SEV3 | Abuse spike, cost spike | Tighten rate limits, block, monitor |
| SEV4 | Isolated abuse report | Handle within 72h |

- Kill switches (PostHog feature flags) for: clip upload, clip sharing, multiplayer,
  leaderboard submission, account creation. Each independently toggleable without a deploy.
- Daily Postgres backups, 30-day retention, and a restore drill performed once before launch.
  An untested backup is not a backup.
- Security contact published at `/security` with a 72-hour acknowledgement commitment.

---

## 11. Phase-wise security tasks

### Phase 0 — Foundation
- [ ] `gitleaks` in CI, blocking
- [ ] eslint rule banning server-only imports from client components
- [ ] `.env.example` with placeholders; `.env*` in `.gitignore`
- [ ] Baseline security headers in `next.config.js`
- [ ] Dependabot + `pnpm audit` gate
- [ ] Write the threat model into the repo (this document) and link it from the README

### Phase 1 — MVP
- [ ] Zod validation on every route handler from the first endpoint
- [ ] CSP in report-only mode, reviewed, then enforced
- [ ] Deterministic engine built in a form that can run headless server-side (this is a
      *security* requirement, not just an architecture one)
- [ ] No `window.game`; production builds mangled, source maps off

### Phase 2 — Accounts
- [ ] Supabase Auth, magic link + Google only, no passwords
- [ ] RLS on every table, default deny, tested with an explicit negative-case test suite
- [ ] Anonymous → account upgrade with old ID invalidation
- [ ] Handle validation, denylist, reserved names
- [ ] Auth rate limits in Redis
- [ ] Session cookie flags verified in an E2E test
- [ ] Privacy policy and terms drafted

### Phase 3 — Clips and sharing
- [ ] Canvas-only capture; confirm by code review that no file/media input path exists
- [ ] Presigned upload URLs, size cap, content-type allowlist, magic-byte verification
- [ ] Clip rate limits; R2 spend alerts and hard caps
- [ ] Escaping audit for handles in OG images and clip overlays
- [ ] Takedown route and contact page live
- [ ] Cross-origin isolation scoped to the encoder route only

### Phase 4 — Leaderboards and meta-traps
- [ ] Tiered verification (§4.1) implemented end to end
- [ ] Headless replay verification worker with CPU and frame caps
- [ ] Per-level minimum-time floors recorded and enforced
- [ ] Suspicion scoring + shadow exclusion
- [ ] Meta-trap sandbox with the §9 rules enforced by automated tests
- [ ] Taunt review workflow and kill switch
- [ ] Age gate and under-18 restrictions implemented
- [ ] Data export and delete endpoints

### Phase 5 — Multiplayer
- [ ] Server-authoritative room state; audit that no client message can assert an outcome
- [ ] Per-tick input validation and rate caps
- [ ] Sabotage solvability validation
- [ ] Room code entropy and brute-force limits
- [ ] Room/IP concurrency caps
- [ ] Load test doubling as an abuse test
- [ ] Emote-only communication confirmed; no free-text path

### Phase 6 — Scale
- [ ] External penetration test or at minimum a structured peer review
- [ ] Backup restore drill
- [ ] Incident runbook written and rehearsed once
- [ ] Review DPDP posture with a lawyer before any monetisation
