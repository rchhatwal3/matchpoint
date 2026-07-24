# HANDOFF — matchpoint

Read this first when resuming. Snapshot of state, decisions, and what's next. Last updated 2026-07-23.

## What it is
Tinder-style swipe app for pairs (couples/friends). Two people share a room via 6-char invite code (Supabase anonymous auth — no accounts yet), swipe decks per category, and only mutual likes become matches. One Expo codebase → iOS + Android + web; web is the live deploy target.

## Live
- **Deployed:** https://rchhatwal3.github.io/matchpoint/ (301-redirects to ramneekchhatwal.com/matchpoint — user chose to keep the redirect).
- Deploy = push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) typecheck+lint+`expo export --platform web` → `gh-pages`. Supabase keys come from repo Actions secrets.
- **Supabase project ref:** `kchrpzeqcionxspctbbl`. Migrations 001–009 all run. Anonymous sign-in enabled. Edge function `get-restaurants` deployed with `PLACES_API_KEY` secret set.

## Stack
Expo (expo-router, TS, react-native-reanimated + gesture-handler), Supabase (Postgres + RLS + anonymous auth + realtime + edge functions), Google Places API (New) via edge function. No web-only libs (no framer-motion/react-router-dom).

## Design — "Split Heart" (approved)
Crimson `#C2314F` = you/action/like; teal `#2E6B7A` = partner. From the favicon's two heart-halves. Fonts: Fraunces (serif, display moments) + Figtree (sans, all UI). Full system in `DESIGN.md`. Light + dark, user toggle. Dark ground is cool-neutral `#121317` (NOT orange/black — that was the rejected "Flame & Iris" iteration).

## Shipped features (all live)
Pairing + invite code; share invite link (`?code=` deep link); Reanimated swipe deck; realtime match reveal (dual-path detection); matches list; date-night randomizer (`/date-night`, category multiselect + "Surprise us"); locations settings + restaurants deck (Google photos + `$`–`$$$$` price filter — **price filter currently buggy, see Pending**); per-item emoji (tacos 🌮); light/dark/system theme toggle; **email account upgrade + recovery (T9, PR #9)**.

## Pending work (see TODO.md)
- **PR #9 MERGED to `main` (2026-07-23) + deployed** — all of T9 email auth + lost-email Phase A warning + session-TTL/recovery docs + SMTP/template docs are now on `main`.
- **T9 lost-email recovery Phase B (recovery codes) — BUILT, PR open (`feat/t9-recovery-codes`, 2026-07-23).** Decisions locked: 8 codes/set · auto-generate right after upgrade · lockout 5 fails/15 min per email · regenerate voids old set. Migration `011` (hashed `recovery_codes` + `recovery_redeem_attempts` lockout table + `recovery_codes_remaining()` RPC + service_role-only `user_id_for_email()`); two edge fns (`issue-recovery-codes` JWT-gated; `redeem-recovery-code` `--no-verify-jwt`, mints a session via admin `generateLink`, no email; in-function per-email lockout); pure `lib/recovery-logic.ts` (100% cov); `AuthProvider` gains `issueRecoveryCodes`/`redeemRecoveryCode`/`codesRemaining`; `/account` recovery section (auto-shows codes after upgrade, copy/download) + "use a recovery code" sign-in path. All static checks green (jest 30, deno 11, typecheck, lint, hex-grep 0, web export). **Live E2E blocked on MANUAL deploy** (run migration 011 + deploy both functions per MANUAL_TODOS; `redeem` MUST be `--no-verify-jwt`). Spec `docs/superpowers/specs/2026-07-23-t9-recovery-codes-design.md`.
- **NEXT: Account Settings hub + price-filter fix.** Plan `docs/superpowers/specs/2026-07-23-account-settings-and-price-filter-plan.md`. Price filter is broken (`filterDeck` always passes `price_level == null`; Places often omits price → narrowing hides nothing; state also resets each deck visit). Plus a sectioned Settings hub (Account/Notifications-stub/Price/Locations) dropping the room-redirect except for Locations. Decisions needed: price-filter scope (per-user vs per-room) + persistence (AsyncStorage vs DB).
- **T9 session TTL — DECIDED (no app code).** Keep indefinite refresh for both sessions; do not bound. Rationale + Supabase specifics in `docs/session-ttl-research.md`; the only action is a dashboard verify in MANUAL_TODOS. Bounding the anonymous session would permanently lose the room (membership tied to anon UID).
- **T9 login (email) — SHIPPED: merged (PR #9) + deployed, verified live end-to-end 2026-07-23.** Passwordless email OTP: standalone `providers/AuthProvider.tsx` (`updateUser` upgrade / `signInWithOtp` recovery / `verifyOtp` / `signOut`), pure `lib/auth-logic.ts` (100% covered), `/account` screen (`app/account.tsx`, 3 states + recovery affordance), settings entry, and an additive `onAuthStateChange` listener in `SessionProvider` that owns room-loading per uid (recovery uid-swap re-bootstraps; email upgrade keeps uid so room survives; sign-out re-anonymizes). Google/Apple still deferred (need OAuth dashboard config). **Product rule preserved:** no cross-provider linking offered. **Live test (browser, real inbox):** Email provider + custom SMTP (Resend, sender `no-reply@ramneekchhatwal.com`) + `{{ .Token }}` templates all live — sent an upgrade code, received a 6-digit code, verified, session went anonymous→permanent ("Signed in as …"), no console errors. **Gotcha found + fixed:** Supabase Email OTP Length was 8 but the app hardcodes 6 → set to 6 (now a REQUIRED constraint in MANUAL_TODOS). **Full multi-flow live test 2026-07-23 — all pass, zero console errors:** (1) upgrade anon→permanent; (2) sign-out re-anonymizes to a fresh empty session; (3) room-survival — created room `LLSFNK` as anon, upgraded, room persisted; (4) recovery — signed out to empty device, signed in with the email, room `LLSFNK` restored; (5) upgrade-only warning gating (absent in sign-in mode); (6) `shouldCreateUser:false` located the existing account (no orphan-create).
- **T13 multi-room** — user belongs to many rooms, switch between them. Needs schema change (`members.id = auth.uid()` caps one room/user → many-to-many membership).
- **T16b** — CAPTCHA + rate limits (manual Supabase dashboard; see security section).

## Security audit (2026-07-22) — status
- PASS: RLS isolation (outsider sees 0 cross-room rows), RPCs injection-safe (no dynamic SQL), edge function JWT-gated (401 without), no secret leakage.
- **HIGH — FIXED + DEPLOYED (PR #2):** `get-restaurants` now caps `location` at 80 and restricts to the caller's own `room.locations` (`isLocationAllowed` in `logic.ts`). Edge function deployed live.
- **MEDIUM — still open (T16b, manual):** enable CAPTCHA + tighten rate limits in Supabase Auth settings (MANUAL_TODOS).
- **LOW:** 11 moderate npm CVEs, all `@expo/config-plugins` build tooling (not runtime).

## Hard rules / gotchas (do not relearn the hard way)
- **DESIGN.md is binding:** Two-Color, No-Beige, Muted-Floor, Calm-Surface. Hex colors ONLY in `lib/theme/tokens.ts` — `grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"` MUST be 0.
- **Migrations before deploy:** the app selects `emoji` and `price_level`; a missing column makes ALL online reads fail. Run new migrations in the SQL Editor before pushing a bundle that selects new columns.
- **New Supabase projects lack default grants:** `authenticated` needed `004_grants`, `service_role` (edge function) needed `007`. `supabase_realtime` publication ships empty (005 members/swipes, 006 rooms). RLS recursion avoided via `member_room_id()` SECURITY DEFINER helper; every definer fn sets `search_path`.
- **Never** put `service_role` in app code. **Frontend never calls third-party APIs** — external data goes through edge functions.
- **Orchestrator commits; subagents do NOT commit/push.** Use `/caveman-commit` for commit messages, `/caveman-review` for PR/diff review.

## Testing / CI (enforced since PR #6)
`npm test` (jest-expo, app logic in `lib/`) · `deno test supabase/functions/` (edge function) · **90% coverage gate** (`test:ci`). Logic worth testing is extracted to `lib/*` and `supabase/functions/*/logic.ts` — test there, don't deep-mock providers. husky `pre-push` blocks pushes on failing typecheck/lint/tests; husky `commit-msg` enforces Conventional Commits; CI `test`+`deno-test` jobs gate deploy; `main` is branch-protected (PR + approving review + green checks required).

## Verify a change
`npm test` · `npm run typecheck` · `npm run lint` · `npx expo export --platform web` · hex grep (above) · live backend probe: source `.env`, python `urllib` against `/auth/v1/signup` → `/rest/v1/...` / `/functions/v1/get-restaurants`.

## Key files
`providers/SessionProvider.tsx` (session hub: anon auth, room/member/partner, all Supabase I/O, realtime, match detection), `lib/theme/tokens.ts` (only hex home), `components/SwipeCard.tsx` (image-or-emoji card), `supabase/functions/get-restaurants/index.ts` (Places + photo + price), `supabase/migrations/00{1..9}_*.sql`, `docs/PLAN.md` (phased plan), `MANUAL_TODOS.md` (human-only steps), `DESIGN.md`, `PRODUCT.md`.
