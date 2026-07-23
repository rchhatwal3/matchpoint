# TODO — matchpoint engineering backlog

Ordered by priority. Human-only steps (API keys, dashboard config, store accounts) live in `MANUAL_TODOS.md`. Full context in `HANDOFF.md`.

## Next up
- [ ] **T16 security fixes** (audit done 2026-07-22):
  - [x] `get-restaurants`: cap `location` length (80) + restrict to caller's `room.locations`. Merged (PR #2) and **deployed live** (`supabase functions deploy get-restaurants` run 2026-07-22).
  - [ ] Enable CAPTCHA + tighten rate limits on anonymous sign-in (Supabase Auth settings → MANUAL_TODOS).
- [x] **T9 login (email)** — BUILT, in review on `feat/t9-email-auth`. Passwordless email OTP: `AuthProvider` + pure `lib/auth-logic.ts` (100% cov) + `/account` screen + settings entry + additive `SessionProvider` auth listener. Upgrade keeps uid (room survives); recovery swaps uid + re-bootstraps; sign-out re-anonymizes. No cross-provider linking. Manual: enable Supabase Email provider (live test: "Signups not allowed for otp" until on) → MANUAL_TODOS.
- [ ] **T9 login (Google + Apple)** — deferred: needs OAuth dashboard config (Google Cloud client IDs, Apple Developer capability + Services ID) wired into Supabase Auth, then `linkIdentity` paths in `AuthProvider`. Enforce no same-email auto-merge (no cross-provider override).

## Later
- [x] **T9 — session TTL policy (research + decide)** — DONE 2026-07-23. Decision: keep indefinite refresh for BOTH sessions, do not bound. Bounding buys no real risk reduction vs. this threat model, and bounding the anonymous session = permanent room loss (membership tied to anon UID). Real control (rotation + reuse detection) is already on by default. Doc: `docs/session-ttl-research.md`; dashboard verify → MANUAL_TODOS. Validated user's "bounded is just as secure" prior: technically true, practically pointless here.
- [~] **T9 — lost-email account recovery** — phased. **Phase A DONE 2026-07-23** (on `feat/t9-email-auth`, PR #9): warning on `/account` upgrade view ("your email is the only key... can't be recovered yet"). **Phase B spec'd** (`docs/superpowers/specs/2026-07-23-t9-recovery-codes-design.md`): one-time recovery codes → hashed table + `redeem-recovery-code` edge fn (service_role, admin `generateLink` mints session, no email) + client redeem flow + tests. Build Phase B on its own later branch off `main` (after PR #9 merges). Google/Apple (deferred) becomes the alternate factor too — needs carve-out from "no cross-provider override".
- [ ] **Offline vacation photos** — `mapSeedToItems` (`lib/session-logic.ts`) hardcodes `image_url: null`, so offline demo mode ignores the `image_url` T15 added to `data/seed.json`. Online (migration 010) is fine. If offline photos are wanted, read `row.image_url` in the map (needs `SeedRow.image_url?`).
- [ ] **T17 image caching** — make item photos (restaurant Google, vacation Wikimedia) fast + durable instead of hotlinked every render. Phased plan: (1) client cache — swap `SwipeCard` Image for `expo-image` (built-in memory+disk cache) + prefetch the next card; (2, optional/ToS-gated) persistent mirror to Supabase Storage for ToS-safe sources ONLY (Wikimedia yes + attribution; Google Places photo bytes NO — their ToS restricts storing them). Decide goal first: speed vs. decoupling from third parties.
- [ ] **T13 multiple rooms** — many rooms per user + a switcher. Schema change: `members.id = auth.uid()` (one room/user) → a membership table (many-to-many). Pairs with T9 for durable identity.
- [ ] **Adversarial QA subagent pass** — user requested; run once the account session limit resets. Break flows, fuzz inputs, retest RLS/rate limits.

## Testing (new — enforced from now on)
- [x] **Test suite + CI coverage gate** — jest-expo + RNTL (app logic) and `deno test` (edge function), 90% coverage gate scoped to `lib/`. GitHub Actions `test` + `deno-test` jobs gate deploy; husky `commit-msg` (commitlint) + `pre-push` (typecheck/lint/test) block bad commits; `.claude` PreToolUse hook reminds caveman-review before git. Branch protection = MANUAL_TODOS.

## Done (this session — all deployed)
Pairing/invite code · share link · swipe deck · realtime matches · date-night randomizer (T8) · locations + restaurants w/ Google photos + price filter (T7, T14) · per-item emoji (T12a) · Split Heart redesign + theme toggle · join-by-code defect fix (T10) · security audit + fix (T16, deployed) · invite link custom domain · swipe-card viewport fix · **travel photos for all 45 vacations (T15, migration 010 pushed live)** · test suite + CI coverage gate (PR #6, merged; branch protection on).
