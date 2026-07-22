# MANUAL_TODOS

Steps only a human can do. Ordered by priority. Check off as completed.

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
