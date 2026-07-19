# MANUAL_TODOS

Steps only a human can do. Ordered by priority. Check off as completed.

## MVP1 — live website (blocks full functionality, site runs in offline demo mode without these)

- [ ] **Create Supabase project** at supabase.com (org: same as recipe-pantry-app). Region: us-east.
- [ ] **Enable anonymous sign-in**: Dashboard → Authentication → Sign In / Up → enable "Anonymous sign-ins".
- [ ] **Run migrations** in order via SQL Editor: `supabase/migrations/001_schema.sql`, `002_rls.sql`, `003_rpc.sql` (or `supabase db push` with the CLI).
- [ ] **Seed items**: run `supabase/seed.sql` in SQL Editor.
- [ ] **Repo secrets** (GitHub → matchpoint → Settings → Secrets and variables → Actions): add `EXPO_PUBLIC_SUPABASE_URL` (Project URL) and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (anon public key). NEVER the service_role key.
- [ ] **Enable GitHub Pages**: repo Settings → Pages → Source: Deploy from a branch → `gh-pages` / root. (Branch appears after first successful deploy workflow run on `main`.)
- [ ] **Local dev env**: copy `.env.example` → `.env`, fill both values.

## Restaurants category (T7 — optional until you want location-based decks)

- [ ] **Places API key**: create Google Cloud project → enable Places API → API key (server-restricted). Alternative: Foursquare Places (free tier).
- [ ] **Set edge function secret**: `supabase secrets set PLACES_API_KEY=...`
- [ ] **Deploy edge function**: `supabase functions deploy get-restaurants` (CLI, logged in + project linked).

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
