# matchpoint

Swipe together, match on what you both want. A Tinder-style decision app for two — spouses, couples, friends. Each partner swipes through decks (food, restaurants, vacations, activities, date nights, shows) and only mutual yeses surface as matches. Matches build a shared bank of common interests that Date Night mode draws from.

**Live:** https://rchhatwal3.github.io/matchpoint/

## How it works

1. One person creates a room, gets a 6-character code.
2. Partner joins with the code. No accounts — anonymous sessions under the hood.
3. Both swipe decks independently, any time.
4. A match fires only when both swiped right. Realtime — you see it the moment it happens.

## Stack

- **Expo** (React Native + TypeScript + expo-router) — one codebase for iOS, Android, and web
- **Supabase** — Postgres + row-level security, anonymous auth, realtime
- **Reanimated** swipe physics; design system in [DESIGN.md](DESIGN.md)

## Run it

```bash
npm install
cp .env.example .env   # fill with Supabase project URL + anon key
npm start              # Expo dev server (scan QR with Expo Go for phone)
npm run web            # web
```

No `.env`? The app runs in offline demo mode (bundled seed data, solo swiping, no persistence).

Checks: `npm run typecheck`, `npm run lint`. Web build: `npm run build:web`.

## Backend setup

See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). Human-only steps (store accounts, API keys, secrets) tracked in [MANUAL_TODOS.md](MANUAL_TODOS.md).

## Deploy

Pushes to `main` run typecheck + lint, build the web bundle (`expo export --platform web`), and publish `dist/` to GitHub Pages via [deploy.yml](.github/workflows/deploy.yml). Supabase keys come from repo Actions secrets; without them the deployed site falls back to offline demo mode.

## Project docs

- [PRODUCT.md](PRODUCT.md) — who it's for, positioning, principles
- [DESIGN.md](DESIGN.md) — Raspberry & Lagoon design system + hard rules
- [docs/PLAN.md](docs/PLAN.md) — phased implementation plan
