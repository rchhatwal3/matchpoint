# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start every session here

Read these three first — they carry state across compaction and fresh conversations:
1. **`HANDOFF.md`** — current state, decisions, live URLs, security findings, gotchas. The fastest way to get up to speed.
2. **`TODO.md`** — engineering backlog, ordered. Pick the next item from here.
3. **`MANUAL_TODOS.md`** — human-only steps (API keys, dashboard config); check before assuming something can be automated.

`docs/PLAN.md` has the full phased plan; `DESIGN.md` / `PRODUCT.md` are required reading before UI work.

## Security reviews live in a private repo (REQUIRED reading before security work)

Full security reviews are **not** in this repository. They are in **[rchhatwal3/matchpoint-security](https://github.com/rchhatwal3/matchpoint-security)** (private), under `reviews/`. `docs/SECURITY.md` is the pointer; `docs/security/` no longer exists here.

This repo is public and must stay public — GitHub Pages serves the live site from it on the free plan. The reviews name unfixed weaknesses down to the file and line, explain why particular controls do not trip, and record which protections are deliberately off. Published before the fixes ship, that is a working attack guide.

**Before starting any security work, read the relevant review in that repo** — each one carries a "verified NOT a problem" section written specifically so the next session doesn't re-audit ground already covered. Clone it alongside this repo, or read it with `gh`:

```
gh api repos/rchhatwal3/matchpoint-security/contents/reviews -q '.[].name'
gh api repos/rchhatwal3/matchpoint-security/contents/reviews/<file> -q .content | base64 -d
```

**When writing about security in THIS repo, describe what needs doing, not how to exploit it.** A `TODO.md` line saying a membership helper must move to an unexposed schema is fine; the reproduction steps, the curl that demonstrates it, and the reasoning about which control fails to fire belong in the private repo. Open findings stay tracked as `TODO.md` items here so the backlog remains complete — only the exploit detail moves.

New reviews go in the private repo as `reviews/YYYY-MM-DD-<slug>.md`, then get filed as `TODO.md` items here.

## Keep the live status dashboard current (REQUIRED)

There is a published Claude Artifact tracking build status — running subagents, PRs in review, shipped/deployed work, the queue, and the 7 goal items:
**https://claude.ai/code/artifact/98a0341f-6f7b-4043-8a5e-5b4ff86ea715** (title `matchpoint · build status`).

Keep it live and accurate. Whenever session state changes materially — a subagent starts/finishes, a PR opens/merges/deploys, a task moves between queued/in-review/done — refresh the artifact **in the same turn**, before ending. Update it by republishing to that exact URL: pass `url: "https://claude.ai/code/artifact/98a0341f-6f7b-4043-8a5e-5b4ff86ea715"` to the Artifact tool (find it via `action: "list"` if the URL is lost). Preserve the Split Heart design system, keep the `❤️` favicon and the stable title so it stays the same artifact. Data comes from `TODO.md` + `gh pr list`.

## Use the knowledge graph for file context

This repo has a graphify knowledge graph at `graphify-out/` (code structure, god nodes, communities, cross-file edges). Prefer it over blind grep/full-file reads for "where/what/how" questions — it returns a scoped subgraph, far smaller than reading files.

- Codebase questions: `graphify query "<question>"` (when `graphify-out/graph.json` exists). `graphify path "<A>" "<B>"` for how two things connect; `graphify explain "<concept>"` for a focused node.
- Broad orientation: skim `graphify-out/GRAPH_REPORT.md` (god nodes = the load-bearing shared code, e.g. `useTheme`, `useSession`, `Text`, `Button`).
- After changing code, refresh it: `graphify . --update` (AST-only, no LLM/API key, cheap). The graph currently covers code (AST); docs/images can be folded in with a full `graphify .` run when subagents/Gemini are available.

## Working style (keep context lean)

- **Delegate token-heavy work to subagents.** Send research and self-contained implementation to subagents with strict file ownership; they do the heavy reading and report a concise summary, keeping the main thread's context clean. The main thread orchestrates, verifies, and commits — **subagents never commit or push.**
- **Work in small chunks.** One logical feature per unit of work. Finish, commit, deploy, then move on — don't let a session balloon until it needs compaction.
- **Update the handoff before context fills.** When a session has made meaningful progress, refresh `HANDOFF.md` and `TODO.md` so the next session (or a fresh conversation) resumes instantly.

## Branch → review → test → PR protocol (REQUIRED for all code changes)

Never commit code straight to `main`. For every piece of new work:

1. **Feature branch per task.** Create `feat/<task-slug>` (or `fix/<slug>`) off `main` before writing code — one branch per task/feature.
2. **caveman-commit every commit.** Use `/caveman-commit` to generate each commit message (Conventional Commits, terse).
3. **Code-review every commit.** Run `/caveman-review` on the diff before it lands; address findings.
4. **Test every change (REQUIRED).** Add/update tests for the change and keep the suite green at **≥90% coverage** on the logic scope. Verify before claiming done: `npm test` (jest), `deno test supabase/functions/` (if the edge function changed), `npm run typecheck`, `npm run lint`, `npx expo export --platform web`, the hex grep, and — when observable — drive it in the browser / probe the live backend. Migrations that add selected columns must be run before a bundle that selects them ships. Logic worth testing lives in `lib/` (pure, unit-tested) and `supabase/functions/*/logic.ts`; extract testable logic out of components/providers rather than mocking heavily. The husky `pre-push` hook blocks any push whose typecheck/lint/tests fail; CI (`.github/workflows/deploy.yml`) re-runs `test` + `deno-test` and deploy is gated on them.
5. **PR, don't push to main.** When the branch is ready, open a PR to `main` with `gh pr create` and STOP — the human reviews and merges manually. Do not merge or push to `main` yourself. Deploy happens on their merge.

`main` is protected-by-convention: it only changes through a human-reviewed PR.

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
- Test: `npm test` (jest-expo, app logic) · `npm run test:ci` (with 90% coverage gate) · `deno test supabase/functions/` (edge function). Verification = tests + typecheck + lint + web export + manual browser flow.

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
- `docs/SECURITY.md` — pointer only. The reviews themselves are in the private `matchpoint-security` repo; read them before any security work
- `docs/SUPABASE_SETUP.md` — backend setup steps in order
- `MANUAL_TODOS.md` — human-only steps (API keys, store accounts, secrets); check here before assuming something can be automated
- `PRODUCT.md` / `DESIGN.md` — impeccable-skill context; read both before UI work

## Conventions

- Branches: `feat/<slug>`, `fix/<slug>` kebab-case. Repo: rchhatwal3/matchpoint.
- No web-only libraries (framer-motion, react-router-dom) — expo-router + react-native-reanimated everywhere.
- Never put the Supabase `service_role` key anywhere in this repo; edge functions read it from their runtime env.
- Frontend never calls third-party APIs at runtime — external data goes through Supabase Edge Functions (`supabase/functions/`).
