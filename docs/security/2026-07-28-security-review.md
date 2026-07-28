# Security review — 2026-07-28 (full `main` branch)

Second full review, one day after the 2026-07-27 adversarial pass whose findings are now all shipped. Three read-only auditors ran in parallel over separate surfaces (Postgres layer; edge functions + auth; client, build and supply chain), each given the previous report — including its "verified NOT a problem" list — and told to re-report a closed finding only with evidence the fix was incomplete. Findings below are the orchestrator's, after verifying the load-bearing claims directly; where a claim was reported but not verified, that is stated.

**Two of the P1s are regressions introduced by fixes shipped this week.** That is the main lesson of this pass: each fix was correct in isolation and reviewed in isolation, and two of them removed a bound that something else was silently relying on.

**Not covered by any code audit:** the provider spend caps (Google Maps Platform per-minute quotas, billing budget alert). They are console configuration, invisible to static analysis, and remain the single open item from the previous pass.

---

## P0 — the local `.env` holds the `service_role` key under `EXPO_PUBLIC_SUPABASE_ANON_KEY`

**Where:** `.env` (untracked, gitignored) · inlined by `lib/supabase.ts:5-6`

Decoding the JWT assigned to `EXPO_PUBLIC_SUPABASE_ANON_KEY` yields `{"role":"service_role","ref":"kchrpzeqcionxspctbbl"}` — the admin key that bypasses RLS entirely, in a variable whose `EXPO_PUBLIC_` prefix means Expo inlines it into every web bundle built on this machine. Confirmed present verbatim in a locally built `dist/_expo/static/js/web/entry-*.js`.

**Production is not affected — verified, not assumed.** The live bundle at `ramneekchhatwal.com/matchpoint` carries `role: anon`; CI builds from its own repo secret, which this file cannot reach. `git log --all -S` shows no service_role material has ever been committed on any branch, and `dist/` has never been tracked.

**Actions (owner: human).**
1. Rotate the `service_role` key in the Supabase dashboard. It has sat on disk in a file named "PUBLIC", was compiled into at least one local bundle, and has been read by two automated processes during this review.
2. Replace the `.env` value with the real `anon` key.
3. Re-verify the edge functions after rotation (they read `SUPABASE_SERVICE_ROLE_KEY` from the runtime env).

The locally built `dist/` was deleted during this review. Rebuild with `npm run build:web`.

---

## P1 — `redeem-recovery-code` is an unauthenticated, unbounded write amplifier

**Where:** `supabase/functions/redeem-recovery-code/index.ts:28` · `fail()` at `:98-100`

The endpoint is deployed `--no-verify-jwt` by design. The email is lowercased and trimmed, and nothing else — no format check, no length bound, though `isValidEmail` exists in `lib/auth-logic.ts:5` and is unused here. An unknown email now reaches `fail()`, which inserts a row.

**Attack:** POST with a fresh multi-hundred-character random string as `email`, no credentials, any origin. Each request writes a row. The lockout is keyed on the email, so rotating the string means it never trips. Nothing else throttles this: the T16b rate limits apply to anonymous *sign-in*, which this endpoint does not require, and CAPTCHA is deliberately off.

**This is a regression from PR #37.** The previous audit's reasoning that the table was bounded rested on "unknown emails write nothing". Closing the enumeration oracle correctly made unknown emails record an attempt — and removed the only thing bounding the table. The 30-day purge (`021`) runs daily and cannot keep pace with a sustained writer.

**Proposed fix:** validate before writing — reject non-email-shaped or over-254-character input with the same generic response and no insert. This does not reopen the oracle: a syntactically invalid address can never be an account, so the attacker learns nothing they could not decide locally. Consider additionally keying the lockout on caller IP.

---

## P1 — the Places lookup budget does not bound anything

**Where:** `supabase/functions/get-restaurants/index.ts:140-163`, called at `:97-98`

`spendLookupBudget` counts, checks, then inserts as three separate statements with no lock or transaction. Migration `018_places_budget.sql:13-16` describes this as "the non-bypassable one". It is bypassable two independent ways:

- **Concurrency.** N simultaneous requests for the same location all read the same pre-burst count and all pass the check before any insert lands. The cache short-circuit at `:82-85` doesn't help — it also runs before any of them has written.
- **Free identities.** The budget keys on `user_id`, while the threat model is unlimited anonymous sessions; each new signup arrives with a fresh 50-lookup allowance.

Secondary damage: `items` has no unique constraint, and the dedupe is computed from a read taken before the API call, so concurrent requests each insert their own rows for the same location. This also fires on the honest path when both partners open a new location's deck simultaneously.

**Proposed fix:** move the spend into a `SECURITY DEFINER` function that takes `pg_advisory_xact_lock`, counts, inserts and returns a verdict in one transaction — the same mechanism `022` used for the member cap. Add a global daily ceiling so free identities cannot multiply the bill, and `UNIQUE (category, title, location)` on `items`.

---

## P2 — `member_room_id(uuid)` is a membership oracle exposed as a PostgREST RPC

**Where:** `supabase/migrations/002_rls.sql:5-8`

**Verified live during this review.** Session B, which had never been a member of any room, called `POST /rest/v1/rpc/member_room_id` with session A's uid and received A's room UUID (200), while a direct read of `members` for the same uid correctly returned `[]`.

`002_rls.sql` contains no `GRANT`/`REVOKE`, and PostgreSQL grants `EXECUTE` to `PUBLIC` by default. This is the one function in the schema that combines RLS bypass with a caller-supplied identifier. Two other definer functions defend against the default (`user_id_for_email`, `replace_recovery_codes`); this one does not.

**Impact:** anyone who has ever seen a member uuid — an ex-partner, or anyone who briefly joined a room — can poll indefinitely afterward to learn whether that person is still in a room, when they move to a different one (the uuid changes), and when they delete their account (`null`). Given two uuids it answers "are these two partners".

**Proposed fix:** a `REVOKE ... FROM public` is insufficient, because the attacker holds an anonymous session and therefore *is* `authenticated`, which the RLS policies require. Move the function to an unexposed schema (`private.member_room_id`), grant EXECUTE to `authenticated` there, and re-point the six policies that call it. PostgREST will not route `/rpc/` to a non-exposed schema.

---

## P2 — the half-completed-erasure message is discarded at its only call site

**Where:** `app/settings.tsx:108-112`

```tsx
deleteMyData().then(() => router.replace('/')).catch((e) => console.warn('deleteMyData failed', e))
```

`delete-account` deletes room data first and the auth user second, so it has exactly one half-done state: data gone, login (and email) still alive. The entire HTTP-200-with-a-body design exists to deliver that message — and this call site sends it to `console.warn`. The screen renders no error at all, so a user in that state sees the button do nothing, concludes deletion failed entirely, and never retries, while believing their email was erased.

`app/account.tsx:63-73` already has the correct pattern.

**This is a defect in work shipped this week (PR #43), authored by this agent.**

**Proposed fix:** give the Settings erasure flow the same rendered error state `account.tsx` uses.

---

## P2 — the recovery lockout fails open and can be weaponized against any address

**Where:** `supabase/functions/redeem-recovery-code/index.ts:36-42`, `:98-100`

The attempts-table read discards its error, and the `fail()` insert's error is never checked. If that table becomes unreachable or loses its grant — which has happened twice on this project, and is why migrations `007` and `012` exist — reads return null, nothing is ever locked, writes fail silently, and the throttle vanishes with no signal. `get-restaurants` fails *closed* on the same class of error; the two functions disagree.

The brute-force consequence is small (125-bit codes). The availability one is not: the lockout is per-email with no IP or global component, so five junk requests every fifteen minutes permanently deny a known address the recovery path at no cost — and since unknown emails now record failures too, any address can be pre-locked, registered or not.

**Proposed fix:** treat both errors as failures, and key the lockout on `(email, caller IP)`.

---

## P2 — duplicate-email accounts would turn redeem into a cross-account session mint

**Where:** `supabase/functions/redeem-recovery-code/index.ts:51` vs `:81-84` · `supabase/migrations/011_recovery_codes.sql:52-55`

The email is resolved to an identity twice, independently: `user_id_for_email` (`SELECT ... LIMIT 1`, no `ORDER BY`) picks the uid the codes are validated against, while `admin.generateLink({ email })` does its own lookup inside GoTrue for the session it mints. Nothing pins the second to the first.

**If two `auth.users` rows can share an email**, an attacker upgrades a throwaway anonymous session to the victim's address, issues themselves recovery codes bound to their own uid, redeems one, and receives a session for whichever row GoTrue picks — potentially the victim's, with no inbox access.

**Whether duplicates are possible is unverified.** `MANUAL_TODOS.md` records that the dashboard control could not be located on 2026-07-28. This is the finding that makes that open question urgent rather than tidy.

**Proposed fix:** make an ambiguous email refuse rather than resolve — `user_id_for_email` raises when more than one row matches instead of `LIMIT 1` — and finish the empirical check.

---

## P3 findings

- **The erasure snapshot is visible to a later room member.** `matches` rows survive the departing member, and the view's snapshot arm returns them for the room unconditionally. If the surviving partner later invites someone new, that stranger sees the erased user's mutual matches — permanently, after that user exercised erasure. Fix: gate the snapshot arm on `members.joined_at <= matches.matched_at`.
- **`matches.matched_at` discloses when the other member erased.** The whole-table `GRANT SELECT` makes it directly readable, and the snapshot is written at the instant of erasure — so the column is the exact departure timestamp, contradicting migration `021`'s own comment. Fix: column-scoped grant (`room_id, item_id`), which keeps the view working under `security_invoker`.
- **`join_room`'s throttle is a TOCTOU.** Concurrent calls all read the same pre-burst count, so the enforced bound is "10 per hour plus whatever is in flight". Same class and same one-line remedy as the member-cap fix in `022`, with a different advisory-lock salt. Does not reopen the brute-force finding (1.07 × 10⁹ space); filed because the control does not enforce the number it documents.
- **A deleted user's token can still write.** `members.id` has no FK to `auth.users`, and access tokens stay signature-valid for up to an hour after `deleteUser`. A retained token can create rows keyed to a uid that no longer exists, and nothing can remove them afterward. Fix: `REFERENCES auth.users(id) ON DELETE CASCADE`, NOT VALID.
- **Free-text locations are world-readable via `items`.** Every anonymous session can enumerate every location string any room has searched. Verified live. Unlinked (no room/user/timestamp column on `items`), which is what keeps it at P3 — it becomes P2 the moment `items` gains one.
- **20 junk rows in the shared catalogue.** The same probe found 20 restaurant rows whose `location` is a 1,000-character run of `A`, sourced "Google Places". They predate the 80-character cap added in PR #2 and are residue of that original finding being exercised. Harmless today (the deck filters by location) but worth deleting.
- **`main`'s ruleset has no required-pull-request rule.** The ruleset is active with deletion protection, non-fast-forward, and the three required checks — note that the legacy branch-protection API returns 404, which reads as "unprotected" and is misleading. What is genuinely missing is the required-PR/approving-review rule that `CLAUDE.md` and `MANUAL_TODOS.md` both claim is in place.
- **GitHub Actions pinned to mutable tags.** `actions/checkout@v4`, `actions/setup-node@v4`, `denoland/setup-deno@v2`, and `peaceiris/actions-gh-pages@v3` — the last runs with `contents: write` and pushes the live site. Fix: pin to commit SHAs.
- **Bearer-header parsing differs across functions.** `delete-account` uses a strict pattern; the two older functions use a permissive `replace`. Not exploitable — `getUser` rejects malformed tokens — but the strict one should be shared.
- **Residual timing delta in redeem** (~one DB round trip between known and unknown emails). The reliable six-request oracle is genuinely closed; this reveals only account existence, and only with many samples.

---

## Verified clean — do not re-audit

Cross-room read and write isolation holds under the composed 22-migration schema, including PostgREST embedding and exact counts. Every table created across all 22 migrations has RLS enabled. No `GRANT ... TO anon` anywhere. No dynamic SQL anywhere — every caller value is a bound parameter. All eight SECURITY DEFINER functions set `search_path`. The migration chain composes correctly: `create_room`/`join_room` across `003 → 013 → 016 → 019` lose nothing but the age parameter, and `room_matches` across `001 → 021 → 022` keeps both arms, the column order, and `security_invoker`.

`delete-account` cannot delete an account that isn't the caller's: it never reads the request body, identity comes only from `getUser`, and the two clients cannot be confused. Recovery-code crypto re-verified (125-bit codes, per-code 128-bit salt, constant-time comparison, race-safe single-use consumption). The atomic-replace fix in `022`/PR #45 is complete. CORS is uniform and CSRF-free across all four functions. No secret reaches the browser bundle: only two `EXPO_PUBLIC_*` names exist, the Places and Foursquare keys are server-side only, and stored photo URLs are the keyless form.

Client-side: no `innerHTML`/`WebView`/`eval` equivalent exists; the `?code=` param is sanitized; `lib/nav.ts` matches a fixed route table with no attacker input; the markdown parser's infinite-loop fix is confirmed present. Every dependency resolves from `registry.npmjs.org` with no dependency-confusion or typosquat indicators; the 11 moderate CVEs remain build-tooling only and are absent from the shipped bundle.

**One operational hazard, not a finding:** the migrations are order-dependent and not idempotent in isolation. Re-running `004_grants.sql` alone would silently restore blanket `UPDATE ON rooms` and `INSERT ON members`, reverting `017` and `022`. This project has re-run grant files three times in response to permission surprises. A pointer comment at the top of `004` would cost nothing.

**Needs a dashboard look, not visible from the repo:** whether `authenticated` holds `CREATE` on schema `public`, and the anonymous-signup rate limit — which is the real ceiling on both the join-code brute force and the Places budget.
