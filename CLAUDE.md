# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tinder-style swipe app for pairs (couples/friends). Two people share a room via 6-char invite code, swipe decks per category (food, restaurants, vacations, activities, date_nights, shows), and only mutual likes surface as matches. Anonymous-first: no accounts (Supabase anonymous auth); auth upgrade is a planned MVP2 feature.

One Expo codebase ships iOS, Android, and web. Web deploys to GitHub Pages (live at https://rchhatwal3.github.io/matchpoint/, redirects to ramneekchhatwal.com/matchpoint).

## Commands

- Install: `npm install`
- Dev server (all platforms): `npm start` — web at localhost:8081
- Web only: `npm run web`
- Typecheck: `npm run typecheck` (tsc --noEmit; covers whole tree)
- Lint: `npm run lint` (expo lint; covers app/ + components/ only)
- Web build: `npm run build:web` (`expo export --platform web` → `dist/`)
- No test suite exists yet. Verification = typecheck + lint + web export + manual browser flow.

## Architecture

### Data flow (the part that needs multiple files to understand)

`providers/SessionProvider.tsx` is the hub. It owns: anonymous session bootstrap, room/member/partner state, all Supabase reads/writes, realtime subscriptions, and match detection. Screens consume it via `useSession()` and never call Supabase directly.

**Match detection is dual-path, deduped by a `seenMatchIds` ref:**
1. On my like, `recordSwipe` queries the partner's swipe row — if they already liked, match fires immediately (works fully async, partners never need to be online together).
2. A realtime `postgres_changes` subscription on the partner's swipes (event `*`, not INSERT — a pass→like change arrives as UPDATE via upsert) catches the partner liking later.

Either path sets `pendingMatch`, rendered once by the root-level `MatchOverlay` mounted in `app/_layout.tsx`.

**Offline demo mode:** when `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` are absent, `lib/supabase.ts` exports `supabase = null` and SessionProvider swaps to bundled `data/seed.json` + in-memory swipes (solo, no matches). Every data method has this branch — preserve it when adding features.

### Backend (supabase/)

Migrations are ordered and all must be applied (SQL editor or `supabase db push`): schema → RLS → RPCs → grants → realtime publication. Three non-obvious constraints learned the hard way:

- New Supabase projects grant nothing to `authenticated` on public tables — RLS alone is not enough; see `004_grants.sql`.
- The `supabase_realtime` publication ships empty — tables must be added or `postgres_changes` silently never fires; see `005_realtime.sql`.
- RLS policies that subquery `members` recurse; the `member_room_id()` SECURITY DEFINER helper exists to break that loop. Every SECURITY DEFINER function must set `search_path`.

Room membership: `members.id` = `auth.uid()` (one user, one room). `create_room`/`join_room` are SECURITY DEFINER RPCs; `join_room` is idempotent. `room_matches` view uses `security_invoker = true` so RLS applies to callers.

### Theme system

`lib/theme/tokens.ts` is the only file allowed to contain hex colors — CI-adjacent check is `grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"` → must be zero hits. Screens resolve colors via `useTheme()`; light/dark both come from tokens. `ThemeProvider` adds a persisted user override (system/light/dark) cycled by the `ThemeToggle` overlay in `_layout.tsx`. Gate all animation on `useReducedMotion()`.

DESIGN.md is binding, not advisory. Its four named rules (Two-Color, No-Beige, Muted-Floor, Calm-Surface) are hard stops enforced in review.

### Deploy

Push to `main` → `.github/workflows/deploy.yml` (typecheck + lint gate, `expo export --platform web`, publish `dist/` to `gh-pages`). Supabase keys are baked in at build time from repo Actions secrets; missing secrets degrade to offline demo mode, not a broken build. `app.json` `experiments.baseUrl: "/matchpoint"` is required for the project-pages path — don't remove it.

## Project docs

- `docs/PLAN.md` — phased implementation plan + MVP2 roadmap (auth: email/Google/Apple)
- `docs/SUPABASE_SETUP.md` — backend setup steps in order
- `MANUAL_TODOS.md` — human-only steps (API keys, store accounts, secrets); check here before assuming something can be automated
- `PRODUCT.md` / `DESIGN.md` — impeccable-skill context; read both before UI work

## Conventions

- Branches: `feat/<slug>`, `fix/<slug>` kebab-case. Repo: rchhatwal3/matchpoint.
- No web-only libraries (framer-motion, react-router-dom) — expo-router + react-native-reanimated everywhere.
- Never put the Supabase `service_role` key anywhere in this repo; edge functions read it from their runtime env.
- Frontend never calls third-party APIs at runtime — external data goes through Supabase Edge Functions (`supabase/functions/`).
