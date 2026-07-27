-- 016_invite_code_hardening.sql
-- An invite code is a bearer credential: six characters are the only thing
-- between a stranger and a room's swipes, matches and shared settings. The
-- 2026-07-27 adversarial QA pass found three weaknesses (P2), all closed here:
--   1. join_room had no throttle. Anonymous sign-in limits (T16b) cost an
--      attacker one signup total, not one per guess, so 32^6 was grindable.
--   2. 'room_not_found' and 'room_full' were distinguishable errors, so the RPC
--      mapped live codes without ever joining one.
--   3. Codes were minted with random() (013:31) — a PRNG, not a CSPRNG.
-- Existing rooms keep their codes; only newly minted ones change.

-- gen_random_bytes lives in pgcrypto, which Supabase installs in the
-- `extensions` schema — hence `SET search_path = public, extensions` below.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Failed join attempts, per caller. Clients can never read this: RLS on with
-- ZERO policies and no grant to anon/authenticated (same default-deny pattern
-- as 011's recovery tables). The SECURITY DEFINER join_room below is the only
-- writer. Rows are pruned to 1 day on write, so nothing accumulates.
CREATE TABLE IF NOT EXISTS join_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid          uuid NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS join_attempts_uid_idx ON join_attempts (uid, attempted_at);
ALTER TABLE join_attempts ENABLE ROW LEVEL SECURITY;

-- create_room: unchanged from 013 except the code is now drawn from
-- gen_random_bytes instead of random(). Same 6 characters, same 32-symbol
-- alphabet (A-Z0-9 minus 0/O/1/I), so existing links, QR codes and the
-- client-side [A-Z0-9]{6} sanitizer all stay valid.
CREATE OR REPLACE FUNCTION create_room(p_name text, p_policy_version text, p_age_confirmed boolean) RETURNS text
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

  INSERT INTO members (id, room_id, display_name, consent_version, consented_at, age_confirmed)
    SELECT v_uid, r.id, p_name, p_policy_version, now(), p_age_confirmed FROM rooms r WHERE r.code = v_code;

  RETURN v_code;
END;
$$;

-- join_room: same signature as 013. Still idempotent — re-joining a room you
-- are already in returns its id and is neither throttled nor recorded.
--
-- Failure is now a single indistinguishable signal: unknown code, full room and
-- a lost race for the second seat all return NULL. The caller cannot tell which,
-- so the code-existence oracle is closed. NULL rather than RAISE is deliberate:
-- PostgREST runs the RPC in one transaction, so an exception would roll back the
-- throttle row along with it and the counter would never record anything. The
-- client maps NULL to one generic message (lib/room-errors.ts).
--
-- Throttle: 10 failed attempts per caller per hour. Typo headroom for a real
-- user is ~3; 10 is generous. For an attacker it caps a session at 10 guesses of
-- a 1.07e9 space, so brute force now costs one anonymous signup per 10 guesses
-- and inherits the T16b sign-in limits as its real ceiling.
CREATE OR REPLACE FUNCTION join_room(p_code text, p_name text, p_policy_version text, p_age_confirmed boolean) RETURNS uuid
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
        INSERT INTO members (id, room_id, display_name, consent_version, consented_at, age_confirmed)
          VALUES (v_uid, v_room_id, p_name, p_policy_version, now(), p_age_confirmed);
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
-- join_attempts is granted to nobody: SECURITY DEFINER needs no table grant,
-- and new Supabase projects grant nothing by default (see 004).
GRANT EXECUTE ON FUNCTION create_room(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION join_room(text, text, text, boolean) TO authenticated;
