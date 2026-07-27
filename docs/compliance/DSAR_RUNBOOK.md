# DSAR Runbook (manual)

Internal runbook for fulfilling data-subject access requests (GDPR/UK GDPR Art. 15,
"access"/"portability") manually. GDPR permits fulfilling access requests within
one month; a two-person MVP with tiny per-user data and rare requests does not
justify building an in-app export endpoint yet (see the consent plan's Decision 4).
Erasure is already self-service — see "Erasure" below.

## Contact

Access/portability requests come in at the privacy contact email published in the
legal pages (`[PRIVACY CONTACT EMAIL]` in `docs/compliance/PRIVACY_POLICY.draft.md`
/ `lib/legal/content/privacy.ts`). **That placeholder must be a real, monitored
inbox before the legal pages go live** — see `MANUAL_TODOS.md`.

## Identity verification

Before disclosing any data:
- **Permanent-account users:** confirm the requester controls the account email —
  e.g. ask them to request the export from the same email address, or verify via
  a fresh OTP round-trip.
- **Anonymous users:** anonymous sessions have no email to verify against. Direct
  them to the in-app "Delete my data" control (Settings → Account) for erasure —
  that is the only mechanism that can identify them (their live session). An
  access/export request from an anonymous user cannot be fulfilled by email at
  all; if they need their data, they must be signed in on the device/browser
  holding the session when we assist them.

## Access / export — SQL to assemble one user's data

Run in the Supabase SQL editor (service role) once identity is verified. Replace
`:uid` with the user's `auth.users.id` (look up by email via `auth.users` if they
provided one, or via `raw_user_meta_data` where applicable).

```sql
-- Auth identity
select id, email, created_at from auth.users where id = :uid;

-- Room membership + consent record
select id, room_id, display_name, joined_at, consent_version, consented_at, age_confirmed
from members where id = :uid;

-- Room (code + shared locations)
select r.id, r.code, r.locations, r.created_at
from rooms r
join members m on m.room_id = r.id
where m.id = :uid;

-- Swipes (preferences)
select item_id, liked, created_at
from swipes where member_id = :uid;

-- Recovery codes metadata (do NOT export code hashes/values — issuance metadata only)
select created_at, used_at
from recovery_codes where user_id = :uid;
```

Assemble the results into a plain export (CSV/JSON) and send it to the requester
at the email they used to make the request, within one month of the request.

## Erasure — already self-service

"Delete my data" in Settings (Account section) calls the `delete_my_data()` RPC
(`supabase/migrations/014_delete_my_data.sql`), which removes the caller's
`members` row (cascading their `swipes`) and the room itself once it has no
members left. No manual runbook step is needed for erasure; if a user asks by
email instead of using the control, point them to it, or (if they cannot access
the app) perform the equivalent delete manually via the SQL editor after identity
verification:

```sql
delete from members where id = :uid; -- cascades swipes
-- then, if the room has no remaining members:
delete from rooms where id = :room_id;
```

## Deferred

An in-app "export my data" button (self-service JSON download, mirroring the
in-app delete control) is a fast-follow, not required for MVP launch. Revisit if
request volume grows.
