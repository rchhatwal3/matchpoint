# Adversarial QA / security audit — matchpoint

Date: 2026-07-27 · Read-only static analysis · No network calls against the live project.
Scope: `supabase/migrations/*`, `supabase/functions/*`, client trust boundaries (`app/`, `components/`, `providers/`, `lib/`), pure-logic fuzzing.
Baseline: `HANDOFF.md` (2026-07-22 audit + 2026-07-26 service_role resolution) was read first; findings below are new or are re-openings of items the handoff records as fixed.

**Threat model assumed:** attacker holds the public anon key (by design), can mint an anonymous session at will, and calls PostgREST / RPC / edge functions directly with curl — not through the app.

**No P0 findings.** Cross-room data isolation genuinely holds (see "Verified NOT a problem"). The two P1s are a financial-abuse hole and an availability landmine.

---

## P1 — `get-restaurants` cost-abuse guard is self-authorizing; unbounded Google Places / Foursquare billing

**Where:** `supabase/functions/get-restaurants/index.ts:69-77` (the guard) · `supabase/migrations/004_grants.sql:12` (`GRANT ... UPDATE ON public.rooms TO authenticated`) · `supabase/migrations/002_rls.sql:27-30` (`rooms_update_members`)

**What the attacker does:**
1. `POST /auth/v1/signup` → anonymous session (free, one signup).
2. `POST /rest/v1/rpc/create_room` → they are now a member of their own room.
3. `PATCH /rest/v1/rooms?id=eq.<their room>` with `{"locations":["<any string ≤80 chars>"]}` — the RLS policy and the table grant both permit this, and no code path validates the contents of `locations`.
4. `POST /functions/v1/get-restaurants` with that same string.

The guard at line 75 checks `isLocationAllowed(loc, room.locations)` — but `room.locations` is a column the caller just wrote. The allowlist is attacker-supplied, so the guard is a no-op against anyone who is not using the UI. Its own code comment states the goal it fails to meet: *"Without this, any anon user could bill the Places API for arbitrary queries (cost-abuse / financial DoS)."*

**Why it is not rate-limited away:** the cache short-circuit at line 81 is keyed on the *exact* location string (`selectRestaurants` does `.eq('location', loc)`). A fresh random string every iteration always misses cache. Each miss costs up to 3 Places Text Search calls (`fetchPlaces`, line 149), up to 60 Place Photo media calls (`resolvePhotoUrl`, line 253), and up to 60 Foursquare search calls (`enrichPricesWithFoursquare`, line 216). There is no per-user, per-room, or global request cap anywhere in the function, and Supabase Edge Functions apply none by default. Loop cost is on the order of dollars per minute against the owner's Google Cloud billing account.

**Secondary impact:** each iteration inserts up to 60 junk rows into the globally-shared `items` table (`index.ts:106-109`, service_role write). Unbounded growth of a table every user reads.

**Amplification:** `SessionProvider.getItems` (`providers/SessionProvider.tsx:383-385`) fans out one edge-function invoke *per location in parallel*, and nothing caps how many locations a room may hold. A room with 500 locations fires 500 concurrent invocations from one screen focus.

**Smallest fix:** the guard cannot be the room row, because the caller owns it. Add a server-side budget in the function itself — count distinct `location` values already inserted with this `member.room_id`, or count invocations per user in a small `places_lookups(user_id, at)` table, and reject past a threshold (e.g. 10 new locations per room, 50 lookups/day/user). Cheapest single change: cap `rooms.locations` length in the DB (`CHECK (array_length(locations,1) <= 10)`) *and* refuse in the function when the requested location is not already an `items.location` and the room has already sourced N distinct locations.

---

## P1 — `parseMarkdown` infinite-loops on any line starting with `|` that is not a well-formed table; hangs the app and the static build

**Where:** `lib/legal/parse-markdown.ts:93-98` (the paragraph fallback), interacting with the table branch at `:70` and `isTableSep` at `:20`

**The bug:** the paragraph branch is the only branch that does not unconditionally advance `i`. Its loop guard is

```js
while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3}\s|>|[-*]\s|-{3,}$|\|)/.test(lines[i].trim()))
```

A line starting with `|` matches the `\|` alternative, so the guard is false on the very first iteration, the body never runs, `blocks.push({type:'paragraph'...})` executes, and `i` is never incremented. The outer `while (i < lines.length)` spins forever. Reaching the paragraph branch with a `|` line requires only that the table branch declined it.

**Three ways to reach it — all confirmed by running the parser's exact logic:**

| Input | Result |
|---|---|
| `\| Data \| Why \|` followed by `\|:-:\|:-:\|` (valid GFM centre-alignment row) | HANG at line 0 |
| A stray prose line beginning with `\|` | HANG at that line |
| A table header row as the last line of the file | HANG at line 0 |
| `\| Data \| Why \|` + `\| --- \| --- \|` (current content style) | OK |

`isTableSep` requires `-{3,}`, so `:-:`, `:--`, `--` and `-` alignment rows — all legal markdown — are rejected as separators and drop the header row into the hang.

**Who triggers it:** not an attacker; the markdown is repo-controlled (`lib/legal/content/privacy.ts`, `terms.ts`). But `HANDOFF.md` and `MANUAL_TODOS.md` both record an imminent workflow where **counsel edits `docs/compliance/*.draft.md` and the result is re-synced into `lib/legal/content/`**. Current content happens to use `|---|---|` everywhere (checked: `privacy.ts:32,49,64`), so it is safe *today*. A lawyer's editor normalizing a table to `|:-:|` is enough to break it.

**Impact:** total, silent. `/legal/privacy` and `/legal/terms` are statically pre-rendered by `expo export --platform web`, so the loop hangs the **CI build** (job never completes, no error message). If it survived to runtime it hangs the JS main thread — white screen, no console error, no recovery. The jest suite for `parse-markdown.test.ts` would also hang rather than fail.

**Smallest fix:** guarantee forward progress. In the paragraph branch, after the inner `while`, add `if (para.length === 0) { blocks.push({ type: 'paragraph', spans: parseInline(lines[i].trim()) }); i++; continue; }` — or simply drop `\|` from the paragraph guard's exclusion regex so a non-table pipe line is consumed as ordinary text. Add a regression test for each of the three inputs above.

---

## P2 — Recovery-code endpoint is a reliable account-enumeration oracle and a renewable lockout DoS

**Where:** `supabase/functions/redeem-recovery-code/index.ts:34-50` and `:66` / `fail()` at `:96-99`

The function is deployed `--no-verify-jwt` with `Access-Control-Allow-Origin: '*'` (`:12-15`), so any script from any origin can call it.

**Enumeration.** Two paths differ observably despite the shared `GENERIC` string:
- Unknown email → `user_id_for_email` returns null → early `return json({ error: GENERIC })` at `:50`, **no attempt row inserted**. An unknown email can therefore never accumulate failures and never locks out.
- Known email + wrong code → `fail()` inserts into `recovery_redeem_attempts`.

Send six requests for a candidate email with a syntactically valid random code. If the sixth returns `"Too many attempts. Wait 15 minutes and try again."` the email is a registered account; if it still returns `GENERIC`, it is not. 100% accurate, six requests per candidate, no auth, no CORS restriction. The function's own header comment claims "no account enumeration" — that property does not hold. (There is a matching timing signal: the known-email path does 8 SHA-256 hashes plus two extra round trips.)

**Lockout DoS.** The same primitive, aimed at a known victim: 5 bad codes every 15 minutes permanently denies that user the recovery-code path. `isLockedOut` is per-email only (`lib/recovery-logic.ts:12-16`) — no IP, no device, no global component — so it costs the attacker nothing. Mitigated by the fact that email OTP still works, so this degrades a backup path rather than locking the account.

**Smallest fix:** record a failed attempt for unknown emails too (call `fail()` on the `!uid` branch at `:50` instead of returning early). That makes both branches indistinguishable and closes the oracle in one line. The lockout DoS is inherent to any per-identifier throttle; bound it by also keying on caller IP so a single source cannot lock arbitrary emails.

---

## P2 — `delete_my_data()` silently destroys the partner's entire match history, contradicting both the confirmation dialog and the privacy policy

**Where:** `supabase/migrations/014_delete_my_data.sql:18` · `supabase/migrations/001_schema.sql:84` (`HAVING count(DISTINCT s.member_id) = 2`) · `app/settings.tsx:100-103` · `lib/legal/content/privacy.ts:113`

**Trigger:** partner A taps Settings → "Delete my data" → confirm. `DELETE FROM members WHERE id = auth.uid()` cascades every one of A's `swipes` rows (FK `ON DELETE CASCADE`, `001_schema.sql:35`). The `room_matches` view requires **two** distinct liking members. With A's swipes gone, no item in that room can ever satisfy the `HAVING` clause again.

**Impact:** partner B, who did nothing, opens `/matches` and `/date-night` and finds them empty forever. The room row survives, so B gets no explanation — just a silently emptied history. Both user-facing texts assert the opposite:
- `app/settings.tsx:101-103` — "Shared matches stay with your partner unless they also delete."
- `lib/legal/content/privacy.ts:113` — "the shared match history … may remain available to that other member unless they also delete it."

**Smallest fix:** decide the product rule, then make one side true. Either (a) correct both texts to say erasure removes the shared match history for both members, or (b) before deleting, snapshot the room's current `room_matches` rows into a `matches` table keyed on `room_id` so the record survives the swipe cascade.

---

## P2 — `delete_my_data()` is not erasure: email, recovery codes, and redeem history all survive

**Where:** `supabase/migrations/014_delete_my_data.sql:8-24` · `providers/SessionProvider.tsx:443-456` · `supabase/migrations/011_recovery_codes.sql:11-31`

The function touches only `members` (and `rooms` when it empties). Everything below is personal data that persists after a user exercises the in-app erasure control:

- **`auth.users`** — the row, including the user's **email address** for upgraded accounts, is untouched. There is no `auth.admin.deleteUser` anywhere in the repo.
- **`recovery_codes`** — rows survive because their `ON DELETE CASCADE` hangs off `auth.users(id)` (`011:13`), which is never deleted. Salted hashes plus a `user_id` linkage remain.
- **`recovery_redeem_attempts`** — stores raw `email` (`011:26`) with no cascade, no cleanup job, and no retention bound anywhere in the schema. Emails accumulate indefinitely, including for deleted users.

`privacy.ts:87-91` promises "Email + permanent-account data … deleted on account deletion" and `:102` lists Erasure as an exercisable right; `:109` points users at "the in-app delete/export controls". The in-app control does not deliver what the policy describes.

**Also worth noting:** the function is correctly idempotent (early `RETURN` when `v_room_id IS NULL`, `:15-17`) and leaves no orphan rooms. It cannot delete another user's data — every predicate is `auth.uid()`. The defect is under-deletion, not over-deletion.

**Smallest fix:** in `delete_my_data()`, add `DELETE FROM recovery_codes WHERE user_id = auth.uid();` and `DELETE FROM recovery_redeem_attempts WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid());`. Deleting the `auth.users` row itself needs an edge function (SQL cannot call the admin API cleanly) — or accept it and amend the policy text to match.

---

## P2 — Invite codes are brute-forceable: `join_room` has no throttle and leaks a code-existence oracle

**Where:** `supabase/migrations/013_consent.sql:52-84` (body), `:94` (`GRANT EXECUTE ... TO authenticated`)

**What the attacker does:** with one anonymous session, loop `POST /rest/v1/rpc/join_room` with generated 6-character codes. Nothing rate-limits RPC execution — the T16b hardening tightened *anonymous sign-in* rate limits (per `HANDOFF.md`), which costs the attacker exactly one signup, not one per guess.

**Two distinct weaknesses:**
1. **Search space.** 32^6 ≈ 1.07 × 10⁹. Against a live population of open (single-member) rooms, expected hits scale linearly with room count — at a few hundred waiting rooms and a sustained guess rate, a hit is hours, not centuries. A successful join grants full read of the partner's swipes and matches, write access to the shared `rooms.locations` / `price_tiers`, and permanent occupation of the second seat.
2. **Existence oracle.** `room_not_found` (`:66`) and `room_full` (`:76`) are distinguishable errors and both surface to the caller. An attacker can map the set of *valid* codes without joining anything, then re-target when a seat frees. `app/index.tsx:16-17` even renders them as distinct user-facing strings.

**Related, lower-weight:** codes are minted with Postgres `random()` (`013:31`), not `gen_random_bytes`. Not practically predictable across sessions, but it is the wrong primitive for a bearer credential.

**Smallest fix:** collapse `room_not_found` and `room_full` into one generic error so the oracle closes (one-line change in the function plus `friendlyError` in `app/index.tsx`). For the brute force, add a per-caller attempt counter inside `join_room` (a `join_attempts(uid, at)` insert plus a count check) — the function is already SECURITY DEFINER, so it can write a table clients cannot read.

---

## P2 — `members_insert_self` lets a direct PostgREST INSERT bypass `join_room()` entirely, including the consent stamp

**Where:** `supabase/migrations/002_rls.sql:39-40` · `supabase/migrations/004_grants.sql:13` (`GRANT SELECT, INSERT ON public.members TO authenticated`)

The policy checks only `id = auth.uid()`. It never constrains `room_id`, `display_name`, `joined_at`, or the consent columns added by `013`. So an anonymous session can `POST /rest/v1/members` directly with any `room_id`, skipping `join_room()` and therefore skipping the invite code, the room-full pre-check, and the consent stamp.

**What actually gates it today:** the caller must know the room's UUID (not derivable — `rooms_select_members` blocks cross-room SELECT, and realtime honours RLS), and the `trg_room_member_limit` trigger (`001_schema.sql:50-63`) still caps at 2. So this is not currently an exploitable cross-room read; it is a missing layer.

**The concrete impact that does land:** a member row can be created with `consent_version = NULL`, `age_confirmed = false`, or with those columns set to arbitrary attacker-chosen values. `013_consent.sql:4-5` states the accountability claim — *"The client gates Create/Join on both boxes, so a member row implies consent"* — and that implication is false. Anyone can forge or omit the record the migration exists to create.

**Smallest fix:** revoke direct INSERT (`REVOKE INSERT ON public.members FROM authenticated;`) and let the two SECURITY DEFINER RPCs be the only write path — they need no table grant. If the grant must stay, tighten the policy to `WITH CHECK (id = auth.uid() AND consent_version IS NOT NULL AND age_confirmed = true)`.

---

## P2 — The consent record is a client-side constant, not a record of user action

**Where:** `providers/SessionProvider.tsx:279-283` and `:311-316`

```ts
const { data: code, error } = await supabase.rpc('create_room', {
  p_name: name,
  p_policy_version: POLICY_VERSION,
  p_age_confirmed: true,          // <- literal
});
```

`p_age_confirmed` is hardcoded `true` on both paths. The real checkbox state lives in `app/index.tsx:42` and is enforced only by disabling the button (`:49`, `:66-69`). The value written to `members.age_confirmed` is therefore always `true` regardless of what the user did, and `p_policy_version` is whatever the client claims. `013_consent.sql:1-5` positions these columns as the demonstrable Art. 5(2) record; as written they demonstrate nothing — the column is a constant, and a direct RPC caller chooses both values freely.

**Impact:** compliance/evidentiary, not exploitable. But it is the exact artifact an auditor would ask for.

**Smallest fix:** thread the real `ConsentState` through — `createRoom(name, consent)` / `joinRoom(code, name, consent)` — and pass `consent.ageConfirmed`. Server-side, have `create_room`/`join_room` `RAISE EXCEPTION 'consent_required'` when `p_age_confirmed` is not true or `p_policy_version` is null.

---

## P3 — Deselecting the last price tier silently re-selects all five

**Where:** `app/swipe/[category].tsx:41-49` (`togglePrice`) · `providers/SessionProvider.tsx:360-372` (`updatePriceTiers`) · `lib/price-filter.ts:20-23` (`normalizePriceTiers`)

**Trigger:** on the Restaurants deck, tap the price chips off one at a time. On the fifth tap the set is empty, `updatePriceTiers([])` writes `{}` to `rooms.price_tiers`, and the optimistic `setRoom` immediately feeds `[]` back through `normalizePriceTiers`, whose "empty → all tiers on" fallback (`price-filter.ts:22`) relights every chip. The user watches their last deselection turn into a full reselection, with no explanation. The realtime echo does the same thing on the partner's device.

**Contributing:** `updatePriceTiers` writes the raw `tiers` array straight to the DB — normalization is read-side only — and `rooms.price_tiers` (`015:15-16`) has no `CHECK`, so out-of-range smallints can be stored by a direct PATCH and are then silently dropped on read.

**Smallest fix:** in `togglePrice`, refuse the toggle that would empty the set (`if (next.size === 0) return;`), which also matches the "priced out" empty state already built at `[category].tsx:245-252`.

---

## P3 — `issue-recovery-codes` voids the old set before the new set is durable

**Where:** `supabase/functions/issue-recovery-codes/index.ts:40-43`

```ts
const del = await svc.from('recovery_codes').delete().eq('user_id', user.id);
if (del.error) throw del.error;
const ins = await svc.from('recovery_codes').insert(rows);
if (ins.error) throw ins.error;
```

Two separate statements, no transaction. If the insert fails (transient DB error, timeout, function cold-start kill between the calls) the user ends with **zero** recovery codes, their previous set irreversibly void, and a 500 whose message says "Try again." For a user who regenerated *because* they had lost email access, that is permanent account loss.

**Smallest fix:** wrap both in a single SECURITY DEFINER SQL function (`replace_recovery_codes(p_user uuid, p_rows jsonb)`) so delete+insert are atomic, and call that instead. Alternative: insert the new set first, then delete rows older than the new batch's `created_at`.

---

## P3 — `get-restaurants` 500 path returns upstream error text to the caller

**Where:** `supabase/functions/get-restaurants/index.ts:113-121`, feeding from `:161` and `:138`

The catch-all serializes `e.message` (or `JSON.stringify(e)`) into the response body. Two throw sites reach it with third-party content: `fetchPlaces` throws `` `Places API ${resp.status}: ${await resp.text()}` `` (`:161`), returning Google's raw error JSON — which includes project/quota/credential diagnostics — to any anon caller; and `selectRestaurants` rethrows the PostgREST error object (`:138`), leaking table names, column names, and Postgres hints. Combined with the P1 above, an attacker probing the function gets a running commentary on the backend.

**Smallest fix:** log the detail with `console.error` (already happening at `:114`) and return a fixed string: `return json({ error: 'Could not load restaurants' }, 500);` — the pattern the other two functions already use.

---

## P3 — `rooms` UPDATE is not column-restricted; a member can rewrite the invite code

**Where:** `supabase/migrations/002_rls.sql:27-30` · `supabase/migrations/004_grants.sql:12`

Documented as an accepted tradeoff in the migration comment, and still accurate — but the surface grew since it was written. A member (or anything running with their session) can PATCH `rooms` and set `code` to an arbitrary value, invalidating any invite link the partner already shared; set `created_at`; write junk into `price_tiers` (no `CHECK`, per `015:15-16`); or write an unbounded `locations` array (no length or element-size limit anywhere), which is also the enabling primitive for the P1 finding.

**Smallest fix:** replace the blanket grant with column grants — `REVOKE UPDATE ON rooms FROM authenticated; GRANT UPDATE (locations, price_tiers) ON rooms TO authenticated;` — plus `CHECK (array_length(locations,1) <= 10)` and `CHECK (price_tiers <@ ARRAY[0,1,2,3,4]::smallint[])`.

---

## P3 — Room member cap is a TOCTOU; three members break matching permanently

**Where:** `supabase/migrations/001_schema.sql:50-63` (trigger) · `supabase/migrations/013_consent.sql:74-77` (RPC pre-check)

Both the RPC's `SELECT count(*) ... IF v_count >= 2` and the trigger's `IF (SELECT count(*) ...) >= 2` read without a lock. Under READ COMMITTED, two people joining the same one-member room concurrently both observe `count = 1`, both pass, and the room ends with three members.

**Impact is not cosmetic:** `room_matches` requires `count(DISTINCT s.member_id) = 2` exactly (`001_schema.sql:84`). In a 3-member room, an item all three like produces `count = 3` and yields **no match**. The room's matching behaviour becomes silently and permanently wrong, with no error anywhere.

**Smallest fix:** `SELECT count(*) ... FROM members WHERE room_id = NEW.room_id FOR UPDATE` is not valid on an aggregate; instead take an advisory lock at the top of the trigger — `PERFORM pg_advisory_xact_lock(hashtextextended(NEW.room_id::text, 0));` — before counting. Separately, change the view's `= 2` to `>= 2` so the failure mode degrades instead of disappearing.

---

## P3 — `recovery_redeem_attempts` retains email addresses indefinitely

**Where:** `supabase/migrations/011_recovery_codes.sql:24-31`

No retention bound, no purge job, no cascade. Every failed and successful redeem writes an email address that is never removed — including for users who have exercised erasure (see the P2 above). Growth is bounded (~5 rows per email per 15 minutes, since unknown emails write nothing and locked-out requests return before `fail()`), so this is a data-retention issue rather than a storage-DoS one.

**Smallest fix:** a `pg_cron` job — `DELETE FROM recovery_redeem_attempts WHERE attempted_at < now() - interval '30 days';` — and a matching line in the privacy policy's retention table (`lib/legal/content/privacy.ts:85-91`, currently `[X months]` placeholders).

---

## Verified NOT a problem — do not re-audit these

**Cross-room isolation (the core question — it holds).** Walked every table's policy + grant pair against a hostile direct-PostgREST caller:
- `rooms` — SELECT and UPDATE both gated on `member_room_id(auth.uid())`; no INSERT policy *and* no INSERT/DELETE grant. A member of room A cannot read or write room B.
- `members` — SELECT is `id = auth.uid() OR room_id = member_room_id(auth.uid())`. No cross-room read. No UPDATE or DELETE grant at all, so a member row cannot be moved or removed by a client. (INSERT is loose — see the P2 above — but not a cross-room *read*.)
- `swipes` — SELECT compares `member_room_id(swipes.member_id)` to the caller's room; a caller with no room gets NULL, which is falsy, not permissive. INSERT/UPDATE are `member_id = auth.uid()`. No DELETE grant.
- `items` — SELECT to any authenticated role (intentional; curated shared catalogue). No write grant to `authenticated`; only service_role writes.
- `recovery_codes` / `recovery_redeem_attempts` — RLS enabled with **zero** policies and no grant to `anon`/`authenticated`. Default-deny is correct and complete.
- `room_matches` — `security_invoker = true`, so the underlying `swipes`/`members` policies apply to the caller. Passing a forged `room_id` in the `.eq()` filter returns nothing.

**SECURITY DEFINER hygiene.** All six definer functions (`member_room_id`, `enforce_room_member_limit`, `create_room`, `join_room`, `recovery_codes_remaining`, `user_id_for_email`, `delete_my_data`) set `search_path = public`. No dynamic SQL / `EXECUTE` anywhere in the migrations — SQL injection via RPC arguments is not reachable. `user_id_for_email` is correctly `REVOKE ALL ... FROM public` + granted to `service_role` only, so it is not a client-facing email oracle.

**`delete_my_data()` cannot touch another user.** Every predicate is `auth.uid()`; it is idempotent (early return when the caller has no room); it leaves no orphan rooms (deletes the room only when the last member leaves). Its defects are under-deletion and the match cascade, both filed above.

**Secret handling.** `.env` is untracked and absent from git history; `.gitignore:34-36` covers it. The `resend_api_key` entry in `.env` lacks the `EXPO_PUBLIC_` prefix, so Expo does not inline it — grepped the built `dist/` bundle for the literal value: not present (the "Resend" hits in `dist/legal/*.html` are prose in the privacy policy's sub-processor table). No `service_role` reference exists outside `Deno.env.get` in the three edge functions. `.github/workflows/deploy.yml` passes only the two public `EXPO_PUBLIC_*` secrets to the build.

**Edge-function auth gating.** `get-restaurants` (`index.ts:57-62`) and `issue-recovery-codes` (`index.ts:20-22`) both validate the bearer JWT via `svc.auth.getUser(jwt)` before doing anything, and `issue-recovery-codes` additionally rejects anonymous/email-less users (`:27-29`). `Access-Control-Allow-Origin: '*'` is safe on all three: auth rides in the `Authorization` header, not cookies, and `Access-Control-Allow-Credentials` is not set — so there is no CSRF path.

**Recovery-code cryptography.** 25 symbols × 32-symbol alphabet = 125 bits, generated from `crypto.getRandomValues` with an unbiased `byte & 31` mapping (`issue-recovery-codes/logic.ts:15-26`). Per-code 128-bit salt. Comparison is constant-time (`redeem/logic.ts:34-39`). Single-use consumption is race-safe via the conditional `UPDATE ... .is('used_at', null).select()` (`redeem/index.ts:69-75`). Brute-forcing a code is infeasible; the lockout is not load-bearing for that.

**Upstream injection in `get-restaurants`.** `loc` reaches Google as a JSON body field (`textQuery`, `index.ts:150`) and Foursquare via `encodeURIComponent` (`:220-221`). No header injection, no path traversal, no query-parameter smuggling. The 80-char cap (`:49-51`) is enforced before any use. (The problem is *which* strings are allowed, not how they are transmitted.)

**Foursquare price back-fill index alignment** (`index.ts:239-244`) — traced the parallel `i++` against the filtered `targets` order; it is correct, prices land on the intended places.

**Pure-logic fuzzing, clean.** `normalizePriceTiers` (nulls, junk, non-integers, empty), `filterDeck` (empty deck, empty filter set, null `price_level`), `deckLoadKey` (empty/unicode/duplicate locations), `upcomingImageUrls` (out-of-range `startIndex`), `groupByCategory` + `rollPicks` (empty pool, single-candidate repeat avoidance, empty category — no division by zero, no out-of-bounds index), `groupCode` / `codesToText` / `normalizeCode` / `isValidRecoveryCode` (empty string, unicode, dashes/spaces; the `[A-HJ-NP-Z2-9]{25}` regex exactly matches the generator's alphabet), `mapSeedToItems`, `isNewMatch`, `isLockedOut` (empty array, all-stale timestamps). None crash, none silently corrupt state. `parseInline` is O(n²) on pathological asterisk runs but not exponential, and the input is repo-controlled.

**Invite-link deep parameter.** `app/index.tsx:29-34` uppercases, strips to `[A-Z0-9]`, and slices to 6 before use, and never auto-submits. No injection surface.

**`LegalDocument` link handling** (`components/LegalDocument.tsx:16`) passes parsed `href` values to `Linking.openURL`. A `javascript:` href would fire, but the markdown source is repo-controlled — noted only so a future "user-supplied markdown" feature does not inherit it silently.

**Session storage.** `lib/supabase.ts:38-48` — SecureStore on native, localStorage on web, `flowType: 'pkce'`, `detectSessionInUrl: false`. Correct for a static-export web target; the recovery flow uses `verifyOtp({ token_hash })` directly rather than URL parsing, so disabling URL detection costs nothing.

---

## Open question worth a human check (not a finding)

`AuthProvider.sendUpgradeCode` (`providers/AuthProvider.tsx:48-52`) upgrades an anonymous session with `updateUser({ email })`. Whether an attacker can *claim* an email already belonging to another account depends on the Supabase dashboard setting "Prevent use of duplicate emails" / secure email change, which is not visible from the repo. Verification requires a dashboard look, which is out of scope for a static read-only pass — worth confirming it is enabled and recording it in `MANUAL_TODOS.md` as a required constraint, alongside the existing OTP-length constraint.
