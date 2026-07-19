# matchpoint — Implementation Plan (v3: cross-platform + locations/date-night)

Tinder-style swipe app for pairs (couples/friends). Categories: food (general), restaurants (location-catered), vacations, activities, date nights, shows/movies. Both partners swipe; only mutual rights become matches. Matches accumulate into a shared "match bank" of common interests; Date Night mode then builds a shortlist from that bank plus fresh suggestions. No accounts — pair via 6-char invite code (Supabase anonymous auth).

**Platforms: iOS + Android + web from one codebase — Expo (React Native + TypeScript + expo-router).** Web build ships to GitHub Pages via `npx expo export --platform web`. Native runs via Expo Go / dev builds (store shipping out of scope for MVP).

Decisions locked with user: standalone repo `matchpoint`, invite-code pairing (no accounts), warm & playful design. Read `PRODUCT.md` + `DESIGN.md` at repo root before any UI work. Orchestration: Fable orchestrates; Opus subagents implement tasks.

---

## Phase 0: Documentation Discovery — FINDINGS (done)

**Copy-ready patterns** (`/Users/ramneekchhatwal/Documents/Code_Projects/`):

| Pattern | Source |
|---|---|
| Expo + expo-router + TS app shape, package.json scripts | `recipe-pantry-app/package.json`, `recipe-pantry-app/app/` |
| Supabase RN client (env guard, singleton, PKCE, AppState refresh) | `recipe-pantry-app/lib/supabase.ts:5-35` |
| SecureStore storage adapter (native) — swap to localStorage on web via `Platform.OS` | `recipe-pantry-app/lib/supabase.ts:12-20` |
| Migrations layout `001_schema.sql` / `002_rls.sql` / `003_rpc.sql` | `recipe-pantry-app/supabase/migrations/` |
| Theme tokens as code + `useTheme()` / `useReducedMotion()` | `recipe-pantry-app/lib/theme/tokens.ts`, `lib/theme/index.ts` |
| GitHub Pages deploy (peaceiris/actions-gh-pages@v3, Node 24) | `Personal-Website/portfolio/.github/workflows/deploy.yml` |
| Design hard stops (Two-Color, No-Beige, Muted-Floor, Calm-Surface) | `matchpoint/DESIGN.md` (carried from recipe-pantry-app) |

**Allowed APIs** (verified in sibling code — do not invent others):
- `@supabase/supabase-js` v2: `createClient`, `auth.signInAnonymously()`, `.from().select/insert/upsert()`, `.channel().on('postgres_changes', …).subscribe()`, `.rpc()`
- Env vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (recipe-pantry-app convention)
- Swipe gestures/animation: `react-native-reanimated` (`useSharedValue`, `useAnimatedStyle`, `withSpring`, `interpolate`) + `react-native-gesture-handler` (`Gesture.Pan()`, `GestureDetector`) — NOT framer-motion (web-only)
- Expo: `expo-router` file routes, `expo export --platform web`, `@expo-google-fonts/nunito` + `expo-font`
- Git: branches `feat/<slug>` kebab-case; remote `rchhatwal3/matchpoint`

**Anti-patterns (hard stops):**
- NEVER `service_role` key in app code
- No tables without RLS
- No runtime third-party scraping/API calls — seed data static, curated at build time
- No invented Supabase/Reanimated APIs; check official docs when unsure
- No web-only libs (framer-motion, react-router-dom) — expo-router + reanimated everywhere

---

## Task Graph

T1 (scaffold), T2 (schema), T3 (seed data) — independent, parallel.
T4 (core app) needs T1+T2+T3. T5 (polish) and T6 (deploy) need T4.

## T1: Scaffold Expo app

1. `npx create-expo-app@latest` (default template, TS + expo-router) into `matchpoint/` — preserve existing PRODUCT.md/DESIGN.md/docs/
2. Strip example screens to minimal shell; app name/slug `matchpoint`, scheme `matchpoint`
3. `lib/theme/tokens.ts` + `lib/theme/index.ts`: copy structure from recipe-pantry-app, values from DESIGN.md frontmatter (raspberry `#C2314F`, lagoon `#2E6B7A`, dark variants, spacing/radii/type scale, TOUCH_TARGET=48)
4. Nunito via `@expo-google-fonts/nunito` (weights 400/600/700/800)
5. `.env.example`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` + service-role warning
6. Scripts: `start`, `ios`, `android`, `web`, `typecheck` (`tsc --noEmit`), `lint`, `build:web` (`expo export --platform web`)

**Verify:** `npm run typecheck` clean; `npx expo export --platform web` produces `dist/`; app boots in Expo web (`npm run web`).

## T2: Supabase schema

`supabase/migrations/` (pure SQL, no live DB needed):
- `001_schema.sql`: `rooms` (id uuid pk default gen_random_uuid(), code text unique, created_at); `members` (id uuid pk = auth.uid(), room_id fk, display_name, joined_at; 2-per-room cap via trigger); `items` (id, category check in ('food','vacations','activities','date_nights','shows'), title, subtitle, image_url null, source); `swipes` (member_id fk, item_id fk, liked bool, created_at, pk(member_id,item_id)); view `room_matches` (item + room where both members liked)
- `002_rls.sql`: RLS on all tables; members see only own room; swipes insert/update only where `member_id = auth.uid()`; items select for authenticated
- `003_rpc.sql`: `create_room(p_name text)` returns code (6-char A-Z0-9, retry on collision); `join_room(p_code text, p_name text)` validates cap, returns room
- `docs/SUPABASE_SETUP.md`: manual steps — create project, enable Anonymous provider, run migrations, seed, env keys

**Verify:** SQL passes `psql` parse or supabase CLI dry run if available; every table has `enable row level security`; grep confirms no `security definer` without `set search_path`.

## T3: Seed data from popular lists

WebSearch popular lists; curate ~40–50 items per category → `supabase/seed.sql` + mirror `data/seed.json` (offline dev fallback):
- shows/movies: IMDb Top/Popular + Rotten Tomatoes streaming lists (mix)
- food: TasteAtlas / popular takeout + dish lists
- vacations: Tripadvisor Travelers' Choice-style destination lists
- activities: popular couples/friends activity lists
- date_nights: popular date-night idea lists

Each item: title, original one-line subtitle (own wording, no copied prose), source list name. SQL must escape quotes; categories exactly match schema check constraint.

**Verify:** counts ≥40/category; `seed.sql` value tuples parse; subtitles original.

## T4: Core app (needs T1–T3)

- `lib/supabase.ts`: singleton; storage adapter — SecureStore on native, localStorage on web (`Platform.OS === 'web'`); `signInAnonymously()` on first launch
- `providers/SessionProvider.tsx`: anon user + room + member state; context hook `useSession()`
- Routes (expo-router): `index` (create room: name → RPC → code display w/ copy; join: code input auto-uppercase), `lobby` (partner presence via realtime on `members`; category chips), `swipe/[category]` (deck), `matches` (per-category matched list)
- Swipe deck: Reanimated pan gesture — card rotation interpolated from translateX, raspberry LIKE / neutral PASS stamps fade with distance, spring exit, next card scales up; ✕/♥ buttons ≥56px mirror gesture; upsert `swipes`
- Match detection: realtime `postgres_changes` on partner swipes (or on `swipes` filtered by room) → mutual like triggers match reveal per DESIGN.md §5 (halo, avatar rings raspberry=you lagoon=partner, single spring; reduced-motion static)
- Offline dev mode: if env vars missing, load `data/seed.json`, fake room locally (pattern: portfolio automationStatus sample-data fallback)

**Verify:** `typecheck` + `lint` clean; web build passes; two browser windows create/join/swipe/match end-to-end (needs live Supabase; else offline-mode smoke test)

## T5: Design polish (needs T4)

Enforce DESIGN.md: hard stops (Two-Color/No-Beige/Muted-Floor/Calm-Surface), dark theme parity via `useTheme()`, empty/waiting states (lagoon = waiting on partner), skeletons not spinners, all animation gated `useReducedMotion()`.

**Verify:** `grep -rn "#[0-9a-fA-F]\{6\}" app/ components/ --include="*.tsx"` → zero hits outside `lib/theme/tokens.ts`; contrast spot-check muted text ≥4.5:1.

## T6: Deploy web (needs T4)

- `.github/workflows/deploy.yml`: adapt portfolio workflow — on push to `main`: npm ci, `npx expo export --platform web`, publish `./dist` via peaceiris/actions-gh-pages@v3, env from repo secrets `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`
- expo-router web base path for project pages (`https://rchhatwal3.github.io/matchpoint/`): set `experiments.baseUrl: "/matchpoint"` in app.json
- README: what it is, run commands, Supabase setup pointer, deploy notes

**Verify:** workflow YAML valid; local `expo export` output opens correctly with baseUrl.

## T7: Locations settings + restaurants deck (needs T4)

- Settings screen: multiselect of locations the pair is in / willing to travel to (curated metro list + free-text add). Stored as `rooms.locations text[]`; either member edits; realtime-synced.
- Restaurants category deck: `items where category='restaurants' and location = any(room.locations)`. General `food` category stays location-independent.
- Restaurant sourcing: Supabase Edge Function `get-restaurants(location)` — server-side call to a places API (Google Places Text Search "popular restaurants in {location}"; server-side key, never in app). Upserts results into `items` with `location`, so swipes reference stable rows and repeat requests hit cache-first (skip API if ≥30 items already stored for that location). Frontend calls only the edge function. Mirrors recipe-pantry-app hard stop: scraping/API work lives in edge functions, never the frontend.
- Manual step (surface to user): places API key as edge function secret (`supabase secrets set`). Until key exists, deck falls back to any statically seeded restaurant rows / empty-state explaining setup.

**Verify:** RLS still holds (locations editable only by room members); edge function deploys (`supabase functions deploy` dry check or code review); deck filters correctly with two locations selected.

## T8: Date Night mode (needs T4, T7)

- New screen "Date Night": builds a shortlist from the match bank — room_matches across restaurants, date_nights, activities, shows — plus 2-3 wildcard unseen items per section.
- Pair picks the plan: tap-to-shortlist then a final quick swipe-off (reuse deck component) on the shortlist; the winner becomes "tonight's pick" (raspberry match-reveal treatment).
- Empty state when match bank thin: prompt to go swipe categories first (lagoon waiting-state styling).

**Verify:** with seeded matches, shortlist renders per section; final pick flow completes; empty state when no matches.

## Final: Verification sweep (orchestrator)

1. `npm run typecheck && npm run lint && npx expo export --platform web` all clean
2. Greps: no `service_role`; no third-party `fetch(` in app code; hex grep passes
3. Push branch, open PR or merge to `main` per user
4. Surface manual steps: Supabase project creation, Anonymous provider, migrations+seed, repo secrets, Pages enablement
