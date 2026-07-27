-- 017_consent_integrity.sql
-- Make the 013 consent stamp an actual record of user action rather than a
-- claim the client can forge or skip (adversarial QA 2026-07-27, two P2s).
--
-- Two holes closed:
-- 1. `members_insert_self` (002_rls.sql:39) constrained only `id = auth.uid()`,
--    and 004_grants.sql granted INSERT on members to authenticated. So a direct
--    PostgREST INSERT could create a member row with any room_id, bypassing
--    create_room/join_room entirely — and with it the invite code, the room-full
--    pre-check, and the consent columns.
-- 2. Nothing at the table level required the consent columns to be populated, so
--    consent_version = NULL / age_confirmed = false was a storable state.
--
-- Fix: the two SECURITY DEFINER RPCs become the only client write path into
-- members (they need no table grant — see 004_grants.sql), and a CHECK makes a
-- missing or false consent stamp fail the insert whichever path writes it,
-- including the RPCs and service_role. The RPC bodies are deliberately NOT
-- re-created here so this migration composes with other in-flight changes to
-- create_room/join_room.

-- Only create_room/join_room may write members from a client session.
REVOKE INSERT ON public.members FROM authenticated;
DROP POLICY IF EXISTS "members_insert_self" ON members;

-- Consent must be recorded on every member row. NOT VALID: member rows created
-- before 013_consent.sql have consent_version = NULL and age_confirmed = false
-- (the column's default), so validating against existing data would fail and
-- abort the migration. NOT VALID still enforces the constraint on every INSERT
-- and UPDATE from here on — only the pre-013 backlog is exempt. Members has no
-- UPDATE grant to authenticated, so no client path can trip on a legacy row.
-- To validate later, backfill those rows then run:
--   ALTER TABLE members VALIDATE CONSTRAINT members_consent_recorded;
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_consent_recorded;
ALTER TABLE members
  ADD CONSTRAINT members_consent_recorded
  CHECK (consent_version IS NOT NULL AND btrim(consent_version) <> '' AND age_confirmed)
  NOT VALID;

COMMENT ON CONSTRAINT members_consent_recorded ON members IS
  'GDPR Art. 5(2): a member row cannot exist without the policy version the user accepted and their 18+ confirmation. NOT VALID so pre-013 rows are grandfathered; enforced on all new rows.';
