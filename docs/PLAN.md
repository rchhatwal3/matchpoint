# matchpoint — Implementation Plan

Tinder-style swipe app for pairs (couples/friends). Five categories: food, vacations, activities, date nights, shows/movies. Both partners swipe; only mutual rights become matches. No accounts — pair via 6-char invite code (Supabase anonymous auth). Deployed to GitHub Pages.

Decisions locked with user: standalone repo `matchpoint` in `~/Documents/Code_Projects/`, no-auth invite-code pairing, warm & playful design (see `PRODUCT.md` / `DESIGN.md` at repo root — read both before any UI work).

Each phase is self-contained: run it in a fresh session by reading this file + cited references.

---

## Phase 0: Documentation Discovery — FINDINGS (done)

**Copy-ready patterns from sibling repos** (`/Users/ramneekchhatwal/Documents/Code_Projects/`):

| Pattern | Source |
|---|---|
| Supabase web client + env guard + realtime channel | `Personal-Website/portfolio/src/components/automationStatus.jsx:19-60` |
| Supabase migrations layout (`001_schema.sql`, `002_rls.sql`, `003_rpc.sql`) | `recipe-pantry-app/supabase/migrations/` |
| Design tokens as code | `recipe-pantry-app/lib/theme/tokens.ts` (adapt to CSS variables for web) |
| GitHub Pages deploy workflow (peaceiris/actions-gh-pages@v3, Node 24) | `Personal-Website/portfolio/.github/workflows/deploy.yml` |
| Design hard stops (Two-Color, No-Beige, Muted-Floor, Calm-Surface) | `recipe-pantry-app/DESIGN.md` → carried into `matchpoint/DESIGN.md` |

**Allowed APIs** (verified in sibling code / official docs — do not invent others):
- `@supabase/supabase-js` v2: `createClient`, `auth.signInAnonymously()`, `.from().select/insert/upsert()`, `.channel().on('postgres_changes', …).subscribe()`, `.rpc()`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Vite convention; portfolio uses `REACT_APP_*` because CRA)
- Framer Motion v11: `motion.div`, `useMotionValue`, `useTransform`, `animate`, `drag="x"`, `onDragEnd`
- Git conventions: branches `feat/<slug>` kebab-case (recipe-pantry-app convention); remote account `rchhatwal3`

**Anti-patterns (hard stops):**
- NEVER put `service_role` key in frontend (warned in `Personal-Website/portfolio/.env.example`)
- No tables without RLS enabled
- No scraping/API calls to third parties from the frontend at runtime — seed data is static, curated at build time
- No invented Supabase methods (e.g. there is no `supabase.match()`); check supabase.com/docs/reference/javascript if unsure

---

## Phase 1: Scaffold + repo

1. `npm create vite@latest . -- --template react-ts` inside `matchpoint/` (files already present: PRODUCT.md, DESIGN.md, docs/PLAN.md — keep them)
2. Add Tailwind CSS v4 (`@tailwindcss/vite` plugin, single `@import "tailwindcss"` in index.css per tailwindcss.com/docs/installation/using-vite)
3. Add deps: `@supabase/supabase-js`, `framer-motion`, `react-router-dom`; `@fontsource/nunito`
4. Define CSS variables in `src/index.css` from DESIGN.md frontmatter tokens (light + `prefers-color-scheme: dark` + `[data-theme]` override)
5. `vite.config.ts`: set `base: '/matchpoint/'` (GitHub Pages project page)
6. `.env.example` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` + service-role warning comment (copy wording from portfolio `.env.example`)
7. Git: repo already initialized on `main` with docs commit; create branch `feat/initial-scaffold`, commit, push

**Verify:** `npm run dev` serves; `npm run build` passes; `git push` succeeds; tokens visible in devtools.

## Phase 2: Supabase schema

Mirror recipe-pantry-app migrations layout. `supabase/migrations/001_schema.sql`:

- `rooms` (id uuid pk, code text unique 6-char, created_at)
- `members` (id uuid pk = `auth.uid()`, room_id fk, display_name text, joined_at) — max 2 per room (enforce via trigger or unique partial index + RPC)
- `items` (id, category text check in ('food','vacations','activities','date_nights','shows'), title, subtitle, image_url nullable, source text)
- `swipes` (member_id fk, item_id fk, liked bool, created_at, pk (member_id, item_id))
- View `matches`: item_ids where both room members liked

`002_rls.sql`: enable RLS everywhere; members read/write only own room's rows; `items` readable by all authenticated (anonymous counts); swipes insert only own `member_id = auth.uid()`.
`003_rpc.sql`: `create_room(display_name)` → returns code; `join_room(code, display_name)` → validates 2-member cap.

Manual steps (surface to user): create Supabase project, enable Anonymous sign-in (Dashboard → Auth → Providers), run migrations via SQL editor or `supabase db push`, put URL + anon key in `.env`.

**Verify:** migrations apply clean; RLS check — anonymous user A cannot read room B's swipes (test in SQL editor with `set role`/`request.jwt` claims).

## Phase 3: Seed data from popular online lists

Research task (WebSearch), curate ~40–50 items per category into `supabase/seed.sql` (and `src/data/seed.json` mirror for offline dev):

- **shows/movies**: IMDb Top/Most Popular + Rotten Tomatoes popular streaming lists (mix movies + series, recent + classics)
- **food**: popular cuisine/dish lists (e.g. TasteAtlas top dishes, common takeout categories)
- **vacations**: top travel destination lists (e.g. Tripadvisor Travelers' Choice)
- **activities**: popular couple/friend activity lists (hiking, board games, cooking class, …)
- **date_nights**: popular date-night idea lists

Each item: title, one-line subtitle, `source` naming the list it came from. No copyrighted prose — titles + own one-line descriptions only. No runtime API dependency.

**Verify:** `select category, count(*) from items group by 1` shows ≥40 each; spot-check subtitles are original wording.

## Phase 4: Frontend core

Screens (react-router, mobile-first):
1. **Home**: create room (name input → RPC `create_room` → show code, copy button) or join (code input → `join_room`)
2. **Lobby**: shows partner presence (realtime on `members` insert — copy channel pattern from `automationStatus.jsx:59+`), category chips to pick deck
3. **Swipe deck**: framer-motion drag card (rotation from `useTransform(x)`, LIKE/PASS stamps, spring exit), ✕/♥ buttons ≥56px, upsert into `swipes`
4. **Match reveal**: realtime subscription on partner's swipes; when mutual like → match reveal per DESIGN.md signature
5. **Matches list**: per-category matched items

State: React context for session (room, member, supabase client singleton in `src/lib/supabase.ts`, pattern from `recipe-pantry-app/lib/supabase.ts` minus SecureStore).

**Verify:** two browser profiles side-by-side — create/join, both swipe, match appears on both in <2s; buttons work with keyboard; `prefers-reduced-motion` disables spring/reveal animation.

## Phase 5: Design polish (impeccable)

Run `/impeccable polish` against the built screens. Enforce hard stops: Two-Color, No-Beige, Muted-Floor (contrast-check all muted text), Calm-Surface (only top deck card at Level 2). Dark theme parity. Empty/waiting states per DESIGN.md §5.

**Verify:** grep for hard-coded hex outside token file (`grep -rn "#[0-9a-fA-F]\{6\}" src --include="*.tsx"` → only token/index.css hits); Lighthouse a11y ≥ 95.

## Phase 6: Deploy + ship

1. Copy `.github/workflows/deploy.yml` from portfolio; adapt: trigger on `main`, `publish_dir: ./dist`, drop `cname`, add `VITE_SUPABASE_*` as repo secrets → build env
2. GitHub repo settings: Pages from `gh-pages` branch (workflow output)
3. Merge `feat/*` branches to `main` via PR (or direct push — user's call), confirm live URL `https://rchhatwal3.github.io/matchpoint/`

**Verify:** live site loads; full create/join/swipe/match flow works on the deployed URL from a phone.

## Final Phase: Verification sweep

1. `npm run build && npx tsc --noEmit` clean
2. Grep anti-patterns: `service_role` nowhere in repo; no `fetch(` to third-party domains in `src/`
3. RLS re-check with fresh anonymous session
4. All DESIGN.md hard-stop greps from Phase 5 pass
5. End-to-end two-device test on production URL
