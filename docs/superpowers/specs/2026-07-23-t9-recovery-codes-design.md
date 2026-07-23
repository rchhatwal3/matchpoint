# T9 — Lost-email account recovery via recovery codes (Phase B design)

**Status:** spec, not yet built. Phase A (upgrade-screen warning) shipped on `feat/t9-email-auth` (PR #9). Build Phase B on its own branch off `main` after PR #9 merges.

## Problem

matchpoint permanent accounts use passwordless email OTP. The email inbox is the *only* key: if a user loses inbox access **and** has no live device session, the account — and its room + matches — is unrecoverable. There is no password fallback by design.

Google/Apple (deferred) will eventually be an alternate factor, but they need dashboard config we don't have yet, and they only help users who linked one. Recovery codes give every permanent account a self-service, inbox-free, second-vendor-free recovery path today.

## Goal

A permanent (email-upgraded) account can regain a session with **zero inbox access and no live device session**, by entering their email plus one previously-saved recovery code. Recovery restores the *same* `auth.uid()`, so the room and matches survive (same uid-swap re-bootstrap the `SessionProvider` auth listener already handles).

Non-goals: recovery for anonymous (un-upgraded) sessions — they have no durable identity to recover to; that's the T13 multi-room / durable-identity track. Recovery codes are permanent-account-only.

## How it fits Supabase (no second vendor, no password)

The keystone is the admin **`generateLink`** API: for an existing user it returns a magic-link `hashed_token` **without sending an email**. The client then calls `verifyOtp({ token_hash, type: 'magiclink' })` to mint a real session. So a service_role edge function can hand a locked-out user a fresh session after verifying a recovery code — no inbox, no password.

## Architecture

Two edge functions + one table + pure logic modules + two `/account` UI affordances.

### Data model — migration `011_recovery_codes.sql`

```
recovery_codes(
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,          -- sha256(salt || code), hex
  salt        text not null,          -- per-code random, hex
  used_at     timestamptz,            -- null = unused
  created_at  timestamptz not null default now()
)
```

- **RLS: deny all to `authenticated`/`anon`.** Only the service_role edge functions touch this table. Grant nothing to client roles (like the rest of the RLS model — grants are not implicit on new projects).
- **`recovery_codes_remaining()`** — SECURITY DEFINER RPC returning the count of unused codes for `auth.uid()` (never the hashes). Sets `search_path`, like every definer fn in this repo. This is the only client-visible read.
- Regenerating codes deletes the caller's prior rows, then inserts the new set (old codes void atomically).

### Code format

- **128-bit random codes**, base32-encoded (26 chars), displayed grouped `XXXXX-XXXXX-XXXXX-XXXXX-XXXX`. High entropy makes brute force infeasible regardless of hash speed, so a salted **SHA-256** (available in Deno Web Crypto, no bcrypt dependency) is sufficient for storage.
- Default **8 codes** issued per set.

### Edge function 1 — `issue-recovery-codes` (JWT-gated, verify ON)

Caller must be the permanent user (their JWT identifies `auth.uid()`).
1. Generate 8 codes (crypto-random), compute per-code salt + `sha256(salt||code)`.
2. Delete the caller's existing `recovery_codes` rows, insert the 8 new hashes.
3. Return the 8 **plaintext** codes **once** in the response — never stored, never logged.

### Edge function 2 — `redeem-recovery-code` (UNAUTHENTICATED — deliberate exception)

The whole point is the user has *no* session, so this endpoint runs with `--no-verify-jwt`. That makes it the primary attack surface — it is compensated, not left open (see Security).
Input `{ email, code }`:
1. Look up the user by email (admin API). Unknown email → generic failure (no enumeration).
2. Atomically consume a matching unused code: `UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id` (hash recomputed with the row's salt; constant-time compare). No row updated → generic failure + throttle bump.
3. On success: `admin.generateLink({ type: 'magiclink', email })` → return its `hashed_token` (+ email) to the client.
4. Client calls `verifyOtp({ token_hash, type: 'magiclink' })` → session restored (same uid → room survives).

### Pure, unit-tested logic (per repo test convention)

- `lib/recovery-logic.ts` — code display grouping, input normalization/validation, `codesRemaining` shaping. jest.
- `supabase/functions/redeem-recovery-code/logic.ts` + `issue-recovery-codes/logic.ts` — code generation, hash+verify (constant-time), throttle decision (given attempt history → allow/deny/lockout). `deno test`. Keep the heavy hashing/DB IO in `index.ts`; test the decisions.

### Client (`app/account.tsx`)

- **Permanent view:** a "Recovery codes" section — `codesRemaining` count + "Generate recovery codes" → calls `issue-recovery-codes`, shows the 8 codes **once** with copy/download and a "save these now, they won't be shown again" caution. Regenerate voids the old set.
- **Sign-in view:** a "Lost access to your email? Use a recovery code" affordance → email + code entry → `redeem-recovery-code` → `verifyOtp` → done. Sits alongside the existing OTP sign-in.
- Update the Phase A warning copy once this ships: "recover with a saved recovery code" instead of "can't be recovered yet."

## Security

- **Brute force on redeem** is the main risk (a valid code mints a full session). Mitigate with: 128-bit codes (infeasible to guess), a per-email failed-attempt throttle with lockout in the edge function, and CAPTCHA + tightened rate limits on this endpoint (folds into the open **T16b** manual task — extend it to cover `redeem-recovery-code`).
- **No enumeration:** unknown email and wrong code return the same generic error with near-constant timing.
- **Single-use + race-safe:** the `UPDATE ... WHERE used_at IS NULL RETURNING` consumes atomically; a double-submit can't redeem twice.
- **Storage:** only salted hashes; plaintext codes exist only in the issue response, never logged.
- **service_role** stays in the edge runtime env only — never in the repo/app (existing rule).
- **Product rule intact:** recovery codes are the same email identity — no cross-provider override.

## Testing / verification

- jest: `lib/recovery-logic.ts` (format/validation/grouping) — keep ≥90% on logic scope.
- `deno test`: generation (uniqueness, entropy), hash+verify (constant-time, salt handling), throttle decision.
- Migration `011` applied before any bundle that calls `recovery_codes_remaining()` (repo rule: migrations precede the bundle that selects/uses new objects).
- Manual/integration: issue → save a code → sign out → redeem with only email+code → confirm session + room restored, code now shows consumed. Inbox-free by construction.
- typecheck, lint, hex-grep (0), `expo export --platform web`.

## Open questions (confirm before building Phase B)

1. **Code count** — 8 default OK, or 10?
2. **Prompt timing** — auto-prompt to generate codes right after email upgrade succeeds, or leave it a manual button in the permanent view? (Auto-prompt = better coverage, one more step in the upgrade flow.)
3. **Lockout policy** — failed-redeem threshold + lockout window (e.g. 5 failures → 15 min lockout per email)? Pairs with T16b CAPTCHA.
4. **Regenerate UX** — confirm that generating a new set voids all previous codes (recommended), vs. appending.

## Manual steps (MANUAL_TODOS at build time)

- Deploy both edge functions; `redeem-recovery-code` with `--no-verify-jwt` (document the exception), `issue-recovery-codes` with JWT verification ON.
- Extend the T16b CAPTCHA + rate-limit task to cover the `redeem-recovery-code` endpoint.
- Run migration `011_recovery_codes.sql`.
