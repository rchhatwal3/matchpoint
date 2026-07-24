# MANUAL_TODOS

Steps only a human can do. Ordered by priority. Check off as completed.

## Testing / CI enforcement (T-tests)

- [ ] **Branch protection on `main`** (GitHub → Settings → Branches → Add rule for `main`): require the status checks **Tests and Coverage**, **Edge Function Tests**, and **Typecheck and Lint** to pass, and require **1 approving review**, before merge. This is the server-side backstop that makes "review + tests before merge" un-skippable; the husky `pre-push` hook enforces the mechanical checks locally, and CI re-runs them.

## MVP1 — live website (blocks full functionality, site runs in offline demo mode without these)

- [x] **Create Supabase project** at supabase.com (org: same as recipe-pantry-app). Region: us-east.
- [x] **Enable anonymous sign-in**: Dashboard → Authentication → Sign In / Up → enable "Anonymous sign-ins".
- [x] **Run migrations** in order via SQL Editor: `supabase/migrations/001_schema.sql`, `002_rls.sql`, `003_rpc.sql` (or `supabase db push` with the CLI).
- [x] **Seed items**: run `supabase/seed.sql` in SQL Editor.
- [x] **Repo secrets** (GitHub → matchpoint → Settings → Secrets and variables → Actions): add `EXPO_PUBLIC_SUPABASE_URL` (Project URL) and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (anon public key). NEVER the service_role key.
- [x] **Enable GitHub Pages**: repo Settings → Pages → Source: Deploy from a branch → `gh-pages` / root. (Branch appears after first successful deploy workflow run on `main`.)
- [x] **Local dev env**: copy `.env.example` → `.env`, fill both values.

## Restaurants category (T7 — optional until you want location-based decks)

The app already sources restaurants through the `get-restaurants` edge function
(never the frontend). Until the steps below are done, the Restaurants deck shows
an empty state ("Set your locations first" / "No restaurants yet") and everything
else works. Run migration `006` regardless (below) so the shared locations list
syncs live between partners.

- [x] **Realtime for rooms** (needed for live location sync): run
      `supabase/migrations/006_realtime_rooms.sql` in the SQL Editor (adds the
      `rooms` table to the `supabase_realtime` publication). Only needs to run once.
- [x] **Service-role grants** (REQUIRED — the edge function fails without it): run
      `supabase/migrations/007_service_role_grants.sql` in the SQL Editor. Grants the
      `service_role` (which the function runs as) SELECT/INSERT on `items`. On projects
      without default blanket grants, the function 500s with "permission denied for
      table items" until this runs.
- [x] **Price-level column** (REQUIRED before the T14 restaurant enrichment ships —
      run BEFORE redeploying `get-restaurants`): run
      `supabase/migrations/009_item_price.sql` in the SQL Editor. Adds `items.price_level`
      (smallint, 1–4, nullable) for the Restaurants price filter. All item reads now
      SELECT this column (same as the emoji column), so online reads error with "column
      items.price_level does not exist" until this migration is applied. 007's grants
      already cover it — no extra grant needed.
- [x] **Places API key**: Google Cloud project → enable **Places API (New)** →
      create an API key. Restrict it to the Places API (server-side key; it lives
      only as a Supabase secret, never in the app).
- [x] **Link the CLI to your project** (once): `supabase link --project-ref YOUR-PROJECT-REF`
- [x] **Set the edge function secret**: `supabase secrets set PLACES_API_KEY=YOUR_KEY`
- [x] **Deploy the edge function**: `supabase functions deploy get-restaurants`
      — keep JWT verification **ON** (do NOT pass `--no-verify-jwt`); app users are
      authenticated (anonymous session) and `supabase.functions.invoke` forwards
      their JWT, so the platform gate is exactly what we want.
- [x] **Use it**: open the app → lobby → "Set your locations" → pick 1+ cities.
      First visit to the Restaurants deck calls the function, which fetches ~20
      places per city and upserts them into `items`. Repeat visits are cache-first
      (≥20 stored rows for a city → no API call).

## T9 email auth (login) — enable before the upgrade flow works live

- [x] **Enable the Email provider**: Dashboard → Authentication → Providers → **Email** → turn ON. Keep "Confirm email" ON. Without this, `updateUser({email})` (account upgrade) and recovery sign-in fail. Now ON — email OTP verified live end-to-end 2026-07-23.
- [x] **Custom SMTP (REQUIRED for real delivery — do this BEFORE the templates step)** — DONE 2026-07-23 via **Resend**, sender `no-reply@ramneekchhatwal.com` (root domain, verified). The built-in Supabase email service sends only **2/hour and only to pre-authorized team members**, so custom SMTP is required for real users.
  1. Resend account → verify a sending domain you own (`ramneekchhatwal.com`) via the SPF/DKIM DNS records Resend provides. (Quick test only: `onboarding@resend.dev` sends solely to your own account email.)
  2. Resend → API Keys → create one (`re_...`).
  3. Dashboard → Authentication → Emails → **SMTP Settings** → enable Custom SMTP: Host `smtp.resend.com`, Port `465` (SSL) or `587` (STARTTLS), Username `resend`, Password = the `re_...` API key, Sender `no-reply@ramneekchhatwal.com`, Sender name `matchpoint`. Save. (No auto "connector" — SMTP is entered manually.)
  4. Bump the send ceiling: Authentication → Rate Limits → email (custom-SMTP baseline ~30/hr).
- [x] **OTP in the email templates** — DONE 2026-07-23, delivered a real 6-digit code verified end-to-end. Dashboard → Authentication → Email Templates. Masters live in `docs/email-templates/` — **Magic Link** ← `magic-link.html` (sign-in), **Change Email Address** ← `change-email.html` (upgrade), optionally **Confirm signup** ← `magic-link.html`. Each MUST include `{{ .Token }}` — default templates ship only `{{ .ConfirmationURL }}` (a link), and the app reads the typed code, never a link. See `docs/email-templates/README.md`.
- [x] **Email OTP Length = 6 (REQUIRED — must match the app)**: Dashboard → Authentication → Providers → **Email** → **Email OTP Length** must be **6**. The app hardcodes a 6-digit code (`lib/auth-logic.ts` `isValidCode` = `/^\d{6}$/`, `app/account.tsx` `maxLength={6}`); a longer setting emits codes the app can never verify. Found live 2026-07-23 (project was set to 8 → corrected to 6). Do NOT change this without also updating the app.
- [x] **(T16b) CAPTCHA + rate limits**: Dashboard → Authentication → tighten rate limits and enable CAPTCHA — now also protects the email OTP send surface, not just anonymous sign-in. **Also cover the `redeem-recovery-code` edge function** (T9 Phase B): it is deployed `--no-verify-jwt` and is the brute-force surface for recovery. Its per-email 5-fails/15-min lockout is in-function; add endpoint rate limits + CAPTCHA here as the outer layer.

## T9 recovery codes (Phase B) — deploy before the recovery UI works live

- [x] **Run migration `011_recovery_codes.sql`** (SQL Editor or `supabase db push`) BEFORE deploying a bundle that calls `recovery_codes_remaining()`. Adds `recovery_codes` + `recovery_redeem_attempts` tables (RLS deny-all), the `recovery_codes_remaining()` RPC (client-visible count), and the `user_id_for_email()` service_role-only helper. Until this runs, the `/account` "Recovery codes" count read fails silently (handled) and Generate errors.
- [x] **Deploy `issue-recovery-codes` with JWT verification ON**: `supabase functions deploy issue-recovery-codes`. It identifies the caller from their JWT and (re)issues their 8-code set.
- [x] **Deploy `redeem-recovery-code` with `--no-verify-jwt`** (deliberate exception — the user has no session at recovery time): `supabase functions deploy redeem-recovery-code --no-verify-jwt`. Verifies email + code, mints a session via admin `generateLink` (no email sent). Compensated by the in-function per-email lockout + T16b above — do not deploy without planning T16b.
- [x] **REDEPLOY `redeem-recovery-code` after the L610 fix**: `supabase functions deploy redeem-recovery-code --no-verify-jwt`. The function now returns HTTP 200 (was 4xx) for expected user failures (wrong code / locked) so `functions.invoke` surfaces the message instead of a generic "non-2xx" error. The happy path is unchanged, so live recovery already works; this only improves the wrong-code/locked message. Redeploy to ship it.
- [ ] **Later (when Google/Apple are added)**: confirm same-email identities do NOT auto-merge (no cross-provider override), per the product rule that an email account must not also be loginable via Google/Apple.
- [ ] **Session TTL — verify only, no bounding** (decision doc: `docs/session-ttl-research.md`): Dashboard → Authentication → Sessions — confirm refresh-token rotation + reuse detection are ON (Supabase default) and access-token expiry stays 1 hour. Leave "Time-box user sessions" and "Inactivity timeout" UNSET (Pro-plan-only anyway). Do NOT bound the anonymous session: room membership is tied to the anon UID, so an expired anon session = permanently lost room. No `lib/supabase.ts` change.

## Mobile apps (shells exist; needed to run on real devices / ship)

- [ ] **Expo account**: sign up / log in (`npx expo login`).
- [ ] **Quick device testing (no build)**: install Expo Go on phone → `npm start` → scan QR. Works today for iOS + Android.
- [ ] **EAS setup for real builds**: `npm i -g eas-cli`, `eas login`, `eas build:configure` (creates `eas.json`, sets `projectId` in app.json).
- [ ] **iOS builds**: Apple Developer Program membership ($99/yr) → `eas build --platform ios`. TestFlight for distribution: `eas submit --platform ios` (needs App Store Connect app record).
- [ ] **Android builds**: `eas build --platform android` (APK/AAB; Google Play Console $25 one-time if publishing) → `eas submit --platform android`.
- [ ] **Deep links / scheme**: `matchpoint://` scheme already configured; verify invite-code share links after first native build.
- [ ] (Later, if shipping to stores) app icons/splash final art, privacy policy URL, store listings.

## Nice-to-have

- [ ] Custom domain for web (optional — currently targets `https://rchhatwal3.github.io/matchpoint/`).
- [ ] Supabase database backups schedule (Dashboard → Database → Backups).
