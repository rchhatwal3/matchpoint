# TODO — matchpoint engineering backlog

Ordered by priority. Human-only steps (API keys, dashboard config, store accounts) live in `MANUAL_TODOS.md`. Full context in `HANDOFF.md`.

## Next up
- [ ] **T16 security fixes** (audit done 2026-07-22):
  - [x] `get-restaurants`: cap `location` length (80) + restrict to caller's `room.locations`. Merged (PR #2) and **deployed live** (`supabase functions deploy get-restaurants` run 2026-07-22).
  - [ ] Enable CAPTCHA + tighten rate limits on anonymous sign-in (Supabase Auth settings → MANUAL_TODOS).
- [ ] **T9 login** — standalone `AuthProvider` + `/account` screen. Anonymous→permanent upgrade: email `updateUser`, Google/Apple `linkIdentity` (preserve uid). Do NOT rewrite `SessionProvider`. **Enforce: email-first accounts cannot also log in via Google/Apple (no cross-provider override).** Dashboard steps (enable providers, manual-linking scope) → MANUAL_TODOS.

## Later
- [ ] **Offline vacation photos** — `mapSeedToItems` (`lib/session-logic.ts`) hardcodes `image_url: null`, so offline demo mode ignores the `image_url` T15 added to `data/seed.json`. Online (migration 010) is fine. If offline photos are wanted, read `row.image_url` in the map (needs `SeedRow.image_url?`).
- [ ] **T17 image caching** — make item photos (restaurant Google, vacation Wikimedia) fast + durable instead of hotlinked every render. Phased plan: (1) client cache — swap `SwipeCard` Image for `expo-image` (built-in memory+disk cache) + prefetch the next card; (2, optional/ToS-gated) persistent mirror to Supabase Storage for ToS-safe sources ONLY (Wikimedia yes + attribution; Google Places photo bytes NO — their ToS restricts storing them). Decide goal first: speed vs. decoupling from third parties.
- [ ] **T13 multiple rooms** — many rooms per user + a switcher. Schema change: `members.id = auth.uid()` (one room/user) → a membership table (many-to-many). Pairs with T9 for durable identity.
- [ ] **Adversarial QA subagent pass** — user requested; run once the account session limit resets. Break flows, fuzz inputs, retest RLS/rate limits.

## Testing (new — enforced from now on)
- [x] **Test suite + CI coverage gate** — jest-expo + RNTL (app logic) and `deno test` (edge function), 90% coverage gate scoped to `lib/`. GitHub Actions `test` + `deno-test` jobs gate deploy; husky `commit-msg` (commitlint) + `pre-push` (typecheck/lint/test) block bad commits; `.claude` PreToolUse hook reminds caveman-review before git. Branch protection = MANUAL_TODOS.

## Done (this session — all deployed)
Pairing/invite code · share link · swipe deck · realtime matches · date-night randomizer (T8) · locations + restaurants w/ Google photos + price filter (T7, T14) · per-item emoji (T12a) · Split Heart redesign + theme toggle · join-by-code defect fix (T10) · security audit + fix (T16, deployed) · invite link custom domain · swipe-card viewport fix · **travel photos for all 45 vacations (T15, migration 010 pushed live)** · test suite + CI coverage gate (PR #6, merged; branch protection on).
