# Auth email templates (T9)

Version-controlled copies of the Supabase Auth email templates. The dashboard is the
source of truth for what's live; these files are the reviewable master — edit here,
then paste into the dashboard.

## Prerequisite: custom SMTP

The built-in Supabase email service sends **2/hour and only to pre-authorized team
members** — every other address gets "Email address not authorized." Configure custom
SMTP (Resend) before these templates deliver to real users. See `MANUAL_TODOS.md` →
"T9 email auth" → Custom SMTP.

## Templates

| File | Dashboard template | App flow | verifyOtp type | Subject |
|------|--------------------|----------|----------------|---------|
| `magic-link.html` | Magic Link | sign-in / restore (`signInWithOtp`) | `email` | Your matchpoint sign-in code |
| `change-email.html` | Change Email Address | upgrade anon→permanent (`updateUser({email})`) | `email_change` | Confirm your email to save your matchpoint account |

## The one rule

Each template MUST contain `{{ .Token }}` — the 6-digit OTP the app's `/account` screen
asks for. Default Supabase templates ship only `{{ .ConfirmationURL }}` (a link); the app
never opens a link, so a link-only template makes the flow appear broken (no code to type).

Optional: paste `magic-link.html` into the **Confirm signup** template too for consistency.
The app uses `shouldCreateUser: false`, so that path won't fire — harmless.

Once Phase B recovery codes ship (`docs/superpowers/specs/2026-07-23-t9-recovery-codes-design.md`),
soften the "only way to recover your account" line in `change-email.html`.
