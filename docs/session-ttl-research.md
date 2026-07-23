# Session TTL: keep indefinite refresh, lean on rotation

**Recommendation — do not bound sessions. For both anonymous and permanent sessions: keep `autoRefreshToken` + `persistSession` (current config), keep the 1-hour access-token JWT, and confirm refresh-token rotation + reuse detection are ON (Supabase default). No time-box. No inactivity timeout.** Ship nothing in app code; the only action is a one-line dashboard verify in `MANUAL_TODOS.md`.

The user's prior — "bounded is just as secure" — is *technically* true and *practically wrong for us*: bounding is not less secure, but it buys no meaningful risk reduction against our threat model while adding real friction. And for the anonymous session it is actively harmful (see below).

## 1. What Supabase actually offers (confirmed, 2026)

- **Refresh-token rotation + reuse detection** — *the* real security control, and it's already on by default. Refresh tokens are single-use; each refresh issues a new one. If an old token is reused outside a 10-second grace interval (Supabase says don't change this), the *entire session family is revoked*. This is what catches a stolen token: the moment either the thief or the real device refreshes, the other is locked out. Available on all plans, app-code-free.
- **Time-box user sessions** — hard maximum session length; forces re-auth after N time regardless of activity. **Pro plan and up only.**
- **Inactivity timeout** — kills sessions not refreshed within a window. **Pro plan and up only.**
- Both bounding controls are enforced *at next refresh*, not proactively, so effective expiry = configured value + up to one JWT lifetime. Both are dashboard toggles, not code.

Sources: [User sessions](https://supabase.com/docs/guides/auth/sessions), [sessions.mdx](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/sessions.mdx), [Anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous).

## 2. Threat model vs. friction

Realistic threats and whether bounding helps:

- **Stolen/shared device** — attacker has the unlocked phone/browser. A time-box or inactivity timeout does nothing; they use the live session immediately. No help.
- **XSS token theft (web)** — attacker exfiltrates the JWT + refresh token from `localStorage` and uses them at once, inside any time-box window. Rotation + reuse detection *does* help here (revokes the family on the race); time-boxing does not. No incremental help from bounding.
- **Lost phone, never recovered** — the session lives on until sign-out. A time-box would eventually close it, but worst-case exposure is "someone sees your swipe matches" — no PII, no payments. Not worth forcing re-auth on every real user to cover.

Bounding's cost is concrete: forced re-auth = re-entering a magic email code. Anonymous users *have no email*, so re-auth for them is impossible — they'd just lose their identity.

## 3. Mobile expectations & the anonymous/permanent split

Native users expect WhatsApp/Instagram "logged in forever." Forced re-auth reads as a bug on native and as mild annoyance on web. Crucially, the two sessions are not symmetric:

- **Anonymous session — never bound.** `members.id = auth.uid()` ties room membership to the anonymous UID. If that session expires and the user hasn't upgraded, their room is *permanently unrecoverable* — no email to sign back in with. Bounding here is data loss, not security.
- **Permanent (upgraded) session** — could tolerate bounding since email-OTP recovery exists, but there's no reason to: same low-sensitivity data, same friction cost. Keep it indefinite too.

## 4. Web / GitHub Pages specifics

Tokens sit in `localStorage` on a static GitHub Pages site (native uses `expo-secure-store`). `localStorage` is XSS-readable, but a static site with no runtime third-party calls (per architecture rules) and no user-generated HTML has a small XSS surface. The right mitigations are CSP + dependency hygiene, not shorter sessions — a time-box doesn't stop an XSS payload that steals and uses the token in the same tick. Rotation + reuse detection is the layer that actually bites here.

## 5. Concrete setting → MANUAL_TODOS

| Session | Time-box | Inactivity timeout | Rotation + reuse detection |
|---|---|---|---|
| Anonymous | none | none | ON (default) |
| Permanent | none | none | ON (default) |

**MANUAL_TODOS (dashboard, not code):** In Supabase → Auth settings, confirm refresh-token rotation and reuse detection are enabled (they are by default) and keep access-token expiry at 1 hour. Leave "Time-box user sessions" and "Inactivity timeout" unset — they're Pro-plan-only anyway. No `lib/supabase.ts` change.
