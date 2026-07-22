# T9 — Email Auth (anonymous → permanent upgrade)

Date: 2026-07-22 · Branch: `feat/t9-email-auth` · Scope: email magic-link/OTP only. Google/Apple deferred to their own task (they need manual OAuth dashboard config).

## Goal

Let an anonymous matchpoint user attach an email so their account — and therefore their room, swipes, and matches — becomes durable and recoverable on another device. Passwordless (Supabase email OTP): no passwords are ever collected or stored.

## Non-goals

- Google / Apple sign-in (deferred; needs manual OAuth setup).
- Cross-provider account linking or same-email merge (explicitly forbidden by product: an email account must not later be loginable via Google/Apple).
- T13 multi-room. Recovery here restores the single existing room via the preserved/loaded uid.

## Architecture

Auth lives in its own provider; `SessionProvider` stays the room/data hub and is touched only minimally (see Integration).

### `lib/auth-logic.ts` (pure, unit-tested — carries the 90% coverage gate)
- `normalizeEmail(raw): string` — trim + lowercase.
- `isValidEmail(email): boolean` — pragmatic single-`@`/domain check.
- `isValidCode(code): boolean` — exactly 6 digits.
- `authView(state): 'anonymous' | 'code-sent' | 'permanent'` — pure reducer from `{ isAnonymous, email, codeSent }` to the screen state.

No Supabase imports here — pure functions only.

### `providers/AuthProvider.tsx` (thin wrapper over `supabase.auth`)
Exposes via `useAuth()`:
- `email: string | null` — the permanent email, else null.
- `isAnonymous: boolean`
- `enabled: boolean` — false in offline demo mode (`supabase === null`); screen shows an "unavailable offline" state.
- `sendUpgradeCode(email)` → `supabase.auth.updateUser({ email })` (sends `email_change` confirmation code to the new address; anonymous users have no old email so only the new one is confirmed).
- `sendSignInCode(email)` → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`.
- `verifyCode(email, token, mode)` → `supabase.auth.verifyOtp({ email, token, type: mode })` where `mode` is `'email_change'` (upgrade) or `'email'` (recovery).
- `signOut()` → `supabase.auth.signOut()`.

Reads identity from `supabase.auth.getUser()` on mount and subscribes to `onAuthStateChange` to keep `email`/`isAnonymous` current. PKCE flow is already configured in `lib/supabase.ts:45`.

### `app/account.tsx` — route `/account`, Split-Heart styled
Three states driven by `authView`:
1. **anonymous** — copy explaining "save your account", email input, "Send code" → `sendUpgradeCode`.
2. **code-sent** — 6-digit input, "Verify" → `verifyCode(..., 'email_change')`; "resend" and "change email" affordances.
3. **permanent** — shows the saved email, "Sign out" button.

A secondary "Already have an account? Sign in" affordance on the anonymous state runs the recovery path (`sendSignInCode` → `verifyCode(..., 'email')`).

### Entry point
An "Account" row in the existing `app/settings.tsx` → `router.push('/account')`.

### Provider nesting (`app/_layout.tsx`)
`AuthProvider` wraps `SessionProvider` (auth is the more fundamental layer).

## Flows

1. **Upgrade (anon → permanent).** email → `updateUser({ email })` → 6-digit code emailed → `verifyOtp(type:'email_change')` → user is now permanent; **uid is unchanged**, so the room/member/matches SessionProvider already holds stay valid. No reload.
2. **Recovery (existing email, new device/browser).** email → `signInWithOtp({ shouldCreateUser:false })` → code → `verifyOtp(type:'email')` → session swaps to the permanent uid → SessionProvider re-bootstraps (see Integration) and loads that account's room.
3. **Sign out.** `signOut()` → returns to a fresh anonymous session.

## Integration with SessionProvider (approved: additive auth listener)

Currently `SessionProvider` bootstraps auth once on mount (`SessionProvider.tsx:96`, deps `[]`) with no auth-state listener. That is fine for upgrade (uid unchanged) but misses the uid change on recovery sign-in.

Change (additive, not a rewrite):
- Extract the existing bootstrap IIFE into a callable (e.g. `bootstrap(user)` / `loadForUser(userId)`).
- Add a single `onAuthStateChange` subscription: when the authenticated `user.id` differs from the current `userId` state, reset room/member/partner and re-run the loader for the new uid; on sign-out (no user) clear state / re-anon.
- Guard against duplicate anonymous sign-ins and the initial event so behavior is unchanged for the common case.

## Security

- **Passwordless** — the app never collects or stores a password. OTP codes only.
- **PKCE** flow (already set).
- `shouldCreateUser: false` on the recovery path so a mistyped email cannot mint an empty orphan account.
- OTP codes are single-use and short-lived (Supabase default); never logged. Emails/tokens never placed in logs or URLs.
- **No cross-provider linking** offered anywhere in this feature. When Google/Apple are added later, verify Supabase "manual linking" / same-email auto-merge settings so an email account can't be hijacked via an OAuth identity (MANUAL_TODOS).
- CAPTCHA + auth rate limits remain the open T16b manual dashboard item; email OTP adds another abuse surface — reinforce in MANUAL_TODOS.

## Testing / verification

- Unit-test `lib/auth-logic.ts` (validation + `authView` reducer) to the 90% gate.
- `npm run typecheck`, `npm run lint`, hex-grep = 0, `npx expo export --platform web`.
- Drive the **upgrade** flow in the browser against live Supabase with a real inbox: add email → receive code → verify → screen shows permanent, room intact after.
- Sign out → confirm anonymous again.
- **Recovery** in a second/incognito browser: sign in with the same email → the account's room loads (proves the auth-listener re-bootstrap).

## Manual steps (append to MANUAL_TODOS.md)

- Confirm Supabase "Change Email Address" + magic-link email templates expose `{{ .Token }}` (6-digit OTP) — default yes; the OTP path depends on it.
- (T16b) Enable CAPTCHA + tighten auth rate limits in Supabase Auth settings — now also covers email OTP.
- When Google/Apple land later: confirm same-email identities do NOT auto-merge (no cross-provider override).
