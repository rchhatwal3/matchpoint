-- 019_age_gate_removal.sql
-- Drop the 18+ age gate from the consent flow. The product no longer asks for an
-- age confirmation, so nothing can supply one — but the 017 CHECK requires
-- `age_confirmed` to be true on every new member row, which would make every
-- create/join fail the moment the age-free build ships. This migration removes
-- that half of the requirement and adds age-free RPC signatures.
--
-- What is deliberately NOT changed:
--   * `members.age_confirmed` stays, column and data intact. It is the historical
--     record of what members who joined under the gate actually confirmed; the
--     GDPR Art. 5(2) accountability argument in 013 rests on keeping it. New rows
--     simply stop populating it and fall back to the column default (false).
--   * The Terms/Privacy half of the consent record stays fully enforced. A member
--     row still cannot exist without the policy version the user accepted.
--
-- Ordering: this migration is SAFE to apply ahead of the deploy, and is meant to
-- be. The new RPCs are ADDED AS OVERLOADS — the 3-arg create_room(text,text,
-- boolean) and 4-arg join_room(text,text,text,boolean) from 016 are left in
-- place, so the currently deployed build keeps creating and joining rooms while
-- this sits applied and the age-free build is still in review. That avoids the
-- lockstep window 013 created for itself (HANDOFF.md: 013 dropped the old
-- signatures and broke live create/join until #28 deployed).
-- The legacy signatures are dropped by the follow-up migration
-- 020_drop_legacy_consent_rpcs.sql, which must NOT be applied until the age-free
-- build is live. Note the old overloads keep writing age_confirmed = the boolean
-- they were passed; that is correct, they are still the gated build's RPCs.

-- Relax the 017 consent CHECK: the `age_confirmed` conjunct goes away, the
-- consent-version conjunct stays exactly as it was. Still NOT VALID, for the
-- same reason 017 gives — member rows created before 013_consent.sql have
-- consent_version = NULL, so a validating ALTER would fail on the pre-013
-- backlog and abort the migration. NOT VALID still enforces on every INSERT and
-- UPDATE from here on. To validate later, backfill those rows then run:
--   ALTER TABLE members VALIDATE CONSTRAINT members_consent_recorded;
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_consent_recorded;
ALTER TABLE members
  ADD CONSTRAINT members_consent_recorded
  CHECK (consent_version IS NOT NULL AND btrim(consent_version) <> '')
  NOT VALID;

COMMENT ON CONSTRAINT members_consent_recorded ON members IS
  'GDPR Art. 5(2): a member row cannot exist without the policy version the user accepted. The 18+ conjunct was dropped in 019 when the age gate was removed; members.age_confirmed remains as the historical record for rows written while the gate existed. NOT VALID so pre-013 rows are grandfathered; enforced on all new rows.';

-- create_room: byte-for-byte the 016 body (016:32-66), minus p_age_confirmed and
-- minus the age_confirmed column on the members INSERT. Everything the 016
-- hardening pass bought is preserved verbatim: gen_random_bytes instead of
-- random(), the same 6 characters from the same 32-symbol alphabet (A-Z0-9 minus
-- 0/O/1/I) so existing links, QR codes and the client-side [A-Z0-9]{6} sanitizer
-- stay valid, the unique_violation retry loop, and `SET search_path = public,
-- extensions` (gen_random_bytes lives in pgcrypto, installed by 016 into the
-- `extensions` schema — dropping `extensions` from the path breaks code minting).
CREATE OR REPLACE FUNCTION create_room(p_name text, p_policy_version text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
  i int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  LOOP
    v_code := '';
    v_bytes := gen_random_bytes(6);
    FOR i IN 1..6 LOOP
      -- 256 is an exact multiple of the 32-symbol alphabet, so `byte % 32` is
      -- a uniform draw — no modulo bias to correct for.
      v_code := v_code || substr(v_chars, (get_byte(v_bytes, i - 1) % 32) + 1, 1);
    END LOOP;
    BEGIN
      INSERT INTO rooms (code) VALUES (v_code);
      EXIT;  -- inserted cleanly; code is unique
    EXCEPTION WHEN unique_violation THEN
      -- collision, loop and try another code
    END;
  END LOOP;

  INSERT INTO members (id, room_id, display_name, consent_version, consented_at)
    SELECT v_uid, r.id, p_name, p_policy_version, now() FROM rooms r WHERE r.code = v_code;

  RETURN v_code;
END;
$$;

-- join_room: byte-for-byte the 016 body (016:82-130), minus p_age_confirmed and
-- minus the age_confirmed column on the members INSERT. Still idempotent —
-- re-joining a room you are already in returns its id and is neither throttled
-- nor recorded.
--
-- Failure is still a single indistinguishable signal: unknown code, full room and
-- a lost race for the second seat all return NULL. The caller cannot tell which,
-- so the code-existence oracle stays closed. NULL rather than RAISE is
-- deliberate: PostgREST runs the RPC in one transaction, so an exception would
-- roll back the throttle row along with it and the counter would never record
-- anything. The client maps NULL to one generic message (lib/room-errors.ts).
--
-- Throttle: unchanged at 10 failed attempts per caller per hour, with the same
-- 1-day prune on write. Removing it, or letting any failure path skip the
-- join_attempts INSERT, re-opens the 2026-07-27 P2 brute-force finding.
CREATE OR REPLACE FUNCTION join_room(p_code text, p_name text, p_policy_version text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_room_id uuid;
  v_count int;
  v_fails int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT count(*) INTO v_fails FROM join_attempts
    WHERE uid = v_uid AND attempted_at > now() - interval '1 hour';
  IF v_fails >= 10 THEN
    -- Safe to RAISE: this branch records nothing, so the rollback costs nothing.
    -- It reveals only the caller's own history, never whether a code exists.
    RAISE EXCEPTION 'too_many_attempts';
  END IF;

  SELECT id INTO v_room_id FROM rooms WHERE code = v_code;

  -- Already in this room: no-op, return it.
  IF v_room_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM members WHERE id = v_uid AND room_id = v_room_id) THEN
    RETURN v_room_id;
  END IF;

  IF v_room_id IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM members WHERE room_id = v_room_id;
    IF v_count < 2 THEN
      BEGIN
        INSERT INTO members (id, room_id, display_name, consent_version, consented_at)
          VALUES (v_uid, v_room_id, p_name, p_policy_version, now());
        RETURN v_room_id;
      EXCEPTION WHEN raise_exception OR unique_violation THEN
        -- Lost the race for the second seat: trg_room_member_limit (001) raises
        -- 'room_full' here. Fall through so that race is not an oracle either.
        NULL;
      END;
    END IF;
  END IF;

  DELETE FROM join_attempts WHERE attempted_at < now() - interval '1 day';
  INSERT INTO join_attempts (uid) VALUES (v_uid);
  RETURN NULL;
END;
$$;

-- Supabase anonymous users authenticate under the 'authenticated' role, so a
-- single grant to authenticated covers both anonymous and full-auth sessions.
-- These are new signatures, so they carry none of 016's grants — without these
-- two lines the age-free build gets a permission-denied on every create/join.
-- join_attempts is still granted to nobody: SECURITY DEFINER needs no table
-- grant, and new Supabase projects grant nothing by default (see 004).
GRANT EXECUTE ON FUNCTION create_room(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION join_room(text, text, text) TO authenticated;
