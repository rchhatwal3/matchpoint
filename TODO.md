# TODO — matchpoint engineering backlog

Ordered by priority. Human-only steps (API keys, dashboard config, store accounts) live in `MANUAL_TODOS.md`. Full context in `HANDOFF.md`.

## Next up
- [ ] **T16 security fixes** (audit done 2026-07-22):
  - [x] `get-restaurants`: cap `location` length (80) + restrict to caller's `room.locations`. Merged to `main` (PR #2). **DEPLOY PENDING — run `supabase functions deploy get-restaurants`; gh-pages CI does NOT deploy edge functions, so the fix is not live until this runs.**
  - [ ] Enable CAPTCHA + tighten rate limits on anonymous sign-in (Supabase Auth settings → MANUAL_TODOS).
- [ ] **T9 login** — standalone `AuthProvider` + `/account` screen. Anonymous→permanent upgrade: email `updateUser`, Google/Apple `linkIdentity` (preserve uid). Do NOT rewrite `SessionProvider`. **Enforce: email-first accounts cannot also log in via Google/Apple (no cross-provider override).** Dashboard steps (enable providers, manual-linking scope) → MANUAL_TODOS.
- [ ] **T15 travel photos** — real `image_url` for the 45 `vacations` items (Wikimedia `Special:FilePath`, verify HTTP 200). Data-only; SwipeCard already renders photos.

## Later
- [ ] **T13 multiple rooms** — many rooms per user + a switcher. Schema change: `members.id = auth.uid()` (one room/user) → a membership table (many-to-many). Pairs with T9 for durable identity.
- [ ] **Adversarial QA subagent pass** — user requested; run once the account session limit resets. Break flows, fuzz inputs, retest RLS/rate limits.

## Done (this session — all deployed)
Pairing/invite code · share link · swipe deck · realtime matches · date-night randomizer (T8) · locations + restaurants w/ Google photos + price filter (T7, T14) · per-item emoji (T12a) · Split Heart redesign + theme toggle · join-by-code defect fix (T10) · security audit (T16).
