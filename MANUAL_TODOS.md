# MANUAL_TODOS

Steps only a human can do. Ordered by priority. Check off as completed.

## Secret API keys — DONE 2026-08-03 (kept for the gotcha)

- [x] `SB_SECRET_KEY` (used by `get-restaurants`, `issue-recovery-codes`, `delete-account`)
- [x] `SB_SECRET_REDEEM` (used only by `redeem-recovery-code`, the one function deployed
      `--no-verify-jwt`, so a compromise there is revocable without touching the others)

**GOTCHA — secret names are case-sensitive, and getting them wrong takes down every
function.** They were first created as `sb_secret_key` / `sb_secret_redeem` (the key
*prefix* used as the variable *name*) while the code reads `SB_SECRET_KEY` /
`SB_SECRET_REDEEM`. `Deno.env.get` returned undefined, the startup guard threw, and all
four functions returned `WORKER_ERROR` 500 until the names were corrected.

Diagnostic: **if OPTIONS preflight 500s, the failure is at module load, not in the
handler** — the `OPTIONS` early-return is the first line of every function. Run
`supabase secrets list` and compare against the exact strings in the code before
investigating anything else.

## Verify the `x-forwarded-for` hop (blocks trusting the recovery IP cap)

PR #52's per-IP cap on `redeem-recovery-code` reads the **rightmost** `x-forwarded-for`
hop, which a client cannot forge. What cannot be determined from the code is whether
that value is the real client address or a constant internal Supabase address. If it is
constant, every caller shares one bucket and the threshold could deny the recovery path
to all users at once.

- [ ] Send a request to the deployed `redeem-recovery-code` from a machine whose public
      IP you know (`curl ifconfig.me`), then read the raw `x-forwarded-for` for that
      request in the Supabase dashboard's Edge Function logs. Rightmost entry equal to
      your IP means the cap is trustworthy; the same fixed value across different source
      IPs means it is not — tell Claude and the cap needs reworking.

## Delete the leftover `APP_SERVICE_KEY` secret

- [ ] `supabase secrets unset APP_SERVICE_KEY` — a temporary credential from the
      2026-07-26 service-role diagnosis. `HANDOFF.md` already records it as deletable,
      and it is still set.

## Security reviews moved to a private repo — DONE 2026-08-03

- [x] Both reviews now live in **rchhatwal3/matchpoint-security** (private). `docs/security/`
      is removed from this repo; `docs/SECURITY.md` points at the new home.
- [x] PR #49 closed unmerged — it would have published the 2026-07-28 review onto public
      `main`, describing both P1s at file:line precision along with the endpoint, why the
      lockout did not trip, and that CAPTCHA is deliberately off.
- [ ] **Keep `matchpoint-security` private.** Making matchpoint itself private was the
      alternative and it is the wrong trade — GitHub Pages needs a public repo on the free
      plan, so it would break the live site to protect documents that need not live there.

## Spend caps on the restaurant APIs (DO FIRST — decided 2026-07-27)

Step 1 of the QA-findings work order in `TODO.md`. No code, no deploy; this is the
only control that bounds the actual money, including against a bug in our own logic.

- [ ] **Google Maps Platform → Quotas** — NOT "APIs & Services → Quotas". Maps
      Platform APIs are configured on their own page, and the quotas you can edit
      there are **per-minute**, not per-day (the daily-cap instruction written here
      on 2026-07-27 was wrong). Suggested: Text Search 10/min, Place Photos 100/min.
      Editing quotas at all requires billing enabled on the project; on a free-trial
      account it is often locked entirely. Add a **budget alert** separately under
      Billing → Budgets & alerts. Sizing context: one cache-missing city costs up to
      3 Text Search calls, up to 60 Place Photos calls and up to 60 Foursquare calls,
      so a cap in the tens breaks the deck on the first new city. Check current
      per-call pricing in the console when picking the budget — don't trust a
      remembered figure.
- [x] **Foursquare developer console** — NOT POSSIBLE, nothing to do. The console
      exposes API keys and usage reporting only; there is no spend cap or settable
      quota, and rate limits are fixed by tier (50 QPS on Sandbox / pay-as-you-go).
      The only bound available there is watching usage.
- [ ] Keep both provider quotas comfortably **above** the app-side caps that land in
      step 3 (10 locations per room, 50 lookups per user per day), or the app layer
      never fires and every rejection comes from the provider instead.

Why it matters: `get-restaurants`' location guard checks the caller's request against
`rooms.locations`, but members hold UPDATE on `rooms`, so the caller writes their own
allowlist. Full detail in the 2026-07-27 adversarial pass in the private [matchpoint-security](https://github.com/rchhatwal3/matchpoint-security) repo.

- [ ] **Confirm duplicate-email behaviour** — there may be no dashboard toggle by
      the name "Prevent use of duplicate emails" in the current Supabase UI, so do not
      hunt for it. Verify empirically instead: from a throwaway anonymous session call
      `updateUser({ email })` with an address that already has an account and see
      whether it is refused. It matters because `sendUpgradeCode` upgrades an
      anonymous session with `updateUser({ email })`, so whether an attacker can claim
      an email already belonging to another account turns on this behaviour, which is
      not visible from the repo. Treat as a REQUIRED constraint like the OTP-length
      one. Looked for the toggle 2026-07-28 and could not confirm it exists.

## Age-gate removal — two migrations, ordered around the deploy (2026-07-27)

The 18+ checkbox is gone; the Terms now state a 16+ minimum that the app never asks
about. `members.age_confirmed` survives as the record of what earlier members
confirmed. Full reasoning in `docs/compliance/REQUIREMENTS.md` §6.

- [x] **Run `019_age_gate_removal.sql`** — DONE 2026-07-27. in the SQL Editor — safe to apply any time,
      including before the PR merges. It relaxes the `members_consent_recorded` CHECK
      (dropping the `age_confirmed` conjunct, keeping the consent-version one) and adds
      `create_room(text,text)` / `join_room(text,text,text)` as OVERLOADS, so the
      currently deployed build keeps working. **Apply this before the deploy** or the
      new build's create/join fail the CHECK.
- [x] **Run `020_drop_legacy_consent_rpcs.sql`** — DONE 2026-07-27, after the deploy. Verified live: both legacy signatures now return `PGRST202`.
      It drops the age-taking 3-arg/4-arg signatures. Applying it early breaks create
      and join for the deployed build — the same lockstep hazard `013` caused.
- [ ] **Tell counsel the stated minimum age changed from 18 to 16** when they do the
      placeholder-fill below, so the eligibility clause is reviewed at the new number.

## Erasure honesty — migration + one new edge function (2026-07-27)

"Delete my data" now snapshots the room's matches so the partner keeps their
history, erases recovery codes and redeem attempts, and — via a new edge
function — deletes the `auth.users` row holding the email. Nothing here works
until both steps below run.

- [x] **Run `021_erasure_honesty.sql`** — DONE 2026-07-28 in the SQL Editor. Adds the `matches`
      snapshot table, re-creates `room_matches` as live rows UNION the snapshot,
      rewrites `delete_my_data()`, and schedules a 30-day `pg_cron` purge of
      `recovery_redeem_attempts`. If the `CREATE EXTENSION pg_cron` line errors,
      enable pg_cron from Dashboard - Database - Extensions and re-run just that
      block; everything above it is independent and already applied. Verify with
      `SELECT jobname, schedule, active FROM cron.job;`.
- [x] **Deploy the new edge function:** `supabase functions deploy delete-account` — DONE 2026-07-28; live E2E passed.
      — JWT verification stays ON (do NOT pass `--no-verify-jwt`). No new secrets;
      it uses the `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
      the runtime already injects. Until it is deployed, the Settings delete
      button fails — the client now calls this function, not the RPC.

## P3 hardening batch — DONE 2026-07-28

- [x] **Run `022_p3_hardening.sql`** — DONE. Column-restricts `rooms` UPDATE to
      `locations` + `price_tiers`, adds the `price_tiers` CHECK, takes an advisory
      lock in the member-cap trigger, changes `room_matches` HAVING to `>= 2`, and
      adds `replace_recovery_codes`. **Live probes passed:** PATCH of `rooms.code`
      returns `42501`, PATCH of `locations` returns 204, `price_tiers = {9}` is
      refused by `rooms_price_tiers_valid`.
- [x] **`supabase functions deploy issue-recovery-codes`** — DONE. Now writes both
      halves of a regenerate through the atomic RPC. NOT yet exercised live: the
      endpoint requires an email account, so an anonymous probe hits the 403 gate.
      Next time you regenerate codes from `/account`, that confirms it.
- [x] **`supabase functions deploy get-restaurants`** — DONE. 500s no longer return
      upstream Google/PostgREST error text.

## GDPR/EU consent + legal pages (blocks the legal pages going live)

- [ ] **Fill legal draft placeholders and remove the DRAFT banner**: before
      `/legal/terms` and `/legal/privacy` are treated as final, counsel must fill
      the `[PLACEHOLDER]` fields in `docs/compliance/TERMS_OF_SERVICE.draft.md`
      and `docs/compliance/PRIVACY_POLICY.draft.md` (legal entity name, contact/
      privacy email, dates, jurisdiction, retention periods, transfer-mechanism
      confirmations), remove the DRAFT banner, then re-sync the finalized bodies
      verbatim into `lib/legal/content/terms.ts` and `lib/legal/content/privacy.ts`
      (bump `POLICY_VERSION` in `lib/legal/policy-meta.ts` if wording changed
      materially, so future re-consent can be triggered). The DSAR contact email
      (`docs/compliance/DSAR_RUNBOOK.md`) must be the same real, monitored inbox.
- [x] **Apply migrations `013_consent.sql` and `014_delete_my_data.sql`** — DONE
      2026-07-26 (SQL Editor). `013` **dropped** the old 1-arg `create_room(text)`
      and 2-arg `join_room(text, text)`, so the *currently deployed* build's
      create/join are broken until the consent PR (#28) deploys — merge + deploy it
      promptly to close that window. New build calls the 3-/4-arg signatures +
      `delete_my_data()`. `015_room_price_tiers.sql` (price filter) also applied.

## Testing / CI enforcement (T-tests)

- [x] **Branch protection on `main`** (GitHub → Settings → Branches → Add rule for `main`): require the status checks **Tests and Coverage**, **Edge Function Tests**, and **Typecheck and Lint** to pass, and require **1 approving review**, before merge. This is the server-side backstop that makes "review + tests before merge" un-skippable; the husky `pre-push` hook enforces the mechanical checks locally, and CI re-runs them.

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

## Restaurants — Foursquare price enrichment (get-restaurants)

- [x] **Provision `FOURSQUARE_API_KEY`** (a **Service API Key** for the new Places API — the legacy v3 host was sunset 2026-05-15):
  1. Sign in at **foursquare.com/developers** (Foursquare developer console) → create a **Project**.
  2. In the project, create a **Service API Key** (NOT the legacy v3 "API Key"/OAuth). Copy it.
  3. Set it as the edge-function secret: `supabase secrets set FOURSQUARE_API_KEY=<service-key>` (or Dashboard → Edge Functions → `get-restaurants` → Secrets).
  4. Redeploy: `supabase functions deploy get-restaurants` (keep JWT verification ON — do NOT pass `--no-verify-jwt`).

  The code calls `https://places-api.foursquare.com/places/search` with `Authorization: Bearer <key>` + `X-Places-Api-Version: 2025-06-17` (pinned as `FSQ_VERSION` in `index.ts`). Until the secret is set, `get-restaurants` runs fine but **skips price enrichment** (logs a note, leaves `price_level` null where Google gave no price) — degrades cleanly. Pagination to ~60 restaurants/city works without this key (Google only). Server-side only; never reaches the app.

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
