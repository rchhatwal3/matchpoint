-- 035_memberships_rpcs.sql
-- T13 part 3: the write paths.
--
-- Three behavioural changes and one new function.
--
-- 1. join_room stops swallowing the second-room insert. Its EXCEPTION handler
--    caught unique_violation — the members_pkey collision a second room caused —
--    and fell through to the generic NULL, which the app renders as "invalid
--    code". That silent swallow IS the 2026-09-09 defect. A second room is now
--    the entire point, so only a genuinely full room can still fall through.
--
-- 2. Both entry points gain a 20-rooms-per-person ceiling. This is new exposure
--    created by the feature: an anonymous session could hold exactly one room
--    before and could otherwise now mint unlimited ones. Raised, not returned as
--    NULL, following the too_many_attempts precedent — it reveals only the
--    caller's own count and the branch records nothing, so the rollback is free.
--
-- 3. delete_my_data becomes account-wide. It erased "the caller's room"; a
--    caller now has several and "delete my account" must mean all of them.
--
-- 4. leave_room is new. Its absence is why 2026-09-09 could not be fixed in the
--    app at all: the only exits were "delete my account" and "sign out", and
--    sign-out returns the same uid.

BEGIN;

-- ---- create_room ----

-- PRESERVE THE CODE GENERATION EXACTLY. The alphabet, the gen_random_bytes
-- draw, the modulo-bias comment and `SET search_path TO 'public', 'extensions'`
-- are migration 016's invite-code hardening: 32 unambiguous symbols with I, O,
-- 0 and 1 removed, drawn uniformly because 256 is an exact multiple of 32.
-- `extensions` is on the search_path because gen_random_bytes and get_byte live
-- there. Only two things change in this function: the members INSERT column
-- names, and the ceiling.
CREATE OR REPLACE FUNCTION public.create_room(p_name text, p_policy_version text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code  text;
  v_rooms int;
  i       int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Same salt as join_room's lock, deliberately: the 20-room ceiling counts
  -- rooms created by either entry path, so a create_room and a join_room
  -- racing for the same caller must serialise against each other, not just
  -- against calls of their own kind.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 2));

  SELECT count(*) INTO v_rooms FROM members WHERE user_id = v_uid;
  IF v_rooms >= 20 THEN
    RAISE EXCEPTION 'too_many_rooms';
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

  INSERT INTO members (user_id, room_id, display_name, consent_version, consented_at)
    SELECT v_uid, r.id, p_name, p_policy_version, now() FROM rooms r WHERE r.code = v_code;

  RETURN v_code;
END;
$$;

-- ---- join_room ----

CREATE OR REPLACE FUNCTION public.join_room(p_code text, p_name text, p_policy_version text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_code    text := upper(trim(p_code));
  v_room_id uuid;
  v_count   int;
  v_fails   int;
  v_rooms   int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Serialises this caller's count-check-record sequence against their own
  -- concurrent calls. Released at transaction end, so it needs no explicit
  -- unlock and none on the rollback the raises below cause either.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 2));

  SELECT count(*) INTO v_fails FROM join_attempts
    WHERE uid = v_uid AND attempted_at > now() - interval '1 hour';
  IF v_fails >= 10 THEN
    -- Safe to RAISE: this branch records nothing. It reveals only the caller's
    -- own history, never whether a code exists.
    RAISE EXCEPTION 'too_many_attempts';
  END IF;

  SELECT id INTO v_room_id FROM rooms WHERE code = v_code;

  -- Already in this room: no-op, return it. Checked before the ceiling so a
  -- capped-out user can still re-open a room they are in.
  IF v_room_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM members WHERE user_id = v_uid AND room_id = v_room_id) THEN
    RETURN v_room_id;
  END IF;

  SELECT count(*) INTO v_rooms FROM members WHERE user_id = v_uid;
  IF v_rooms >= 20 THEN
    RAISE EXCEPTION 'too_many_rooms';
  END IF;

  IF v_room_id IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM members WHERE room_id = v_room_id;
    IF v_count < 2 THEN
      BEGIN
        INSERT INTO members (user_id, room_id, display_name, consent_version, consented_at)
          VALUES (v_uid, v_room_id, p_name, p_policy_version, now());
        RETURN v_room_id;
      EXCEPTION WHEN raise_exception THEN
        -- Lost the race for the second seat: trg_room_member_limit raises
        -- 'room_full' here. Fall through so that race is not an oracle either.
        --
        -- unique_violation is deliberately NOT caught any more. It used to mask
        -- the members_pkey collision from a second-room join; that collision no
        -- longer exists, and swallowing it would hide a real bug.
        NULL;
      END;
    END IF;
  END IF;

  DELETE FROM join_attempts WHERE attempted_at < now() - interval '1 day';
  INSERT INTO join_attempts (uid) VALUES (v_uid);
  RETURN NULL;
END;
$$;

-- ---- leave_room (new) ----

CREATE OR REPLACE FUNCTION public.leave_room(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_remaining int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Not a member: return silently. It must NOT distinguish "not your room" from
  -- "no such room" — that difference is precisely the membership oracle 026
  -- closed.
  IF NOT EXISTS (SELECT 1 FROM members WHERE user_id = v_uid AND room_id = p_room) THEN
    RETURN;
  END IF;

  -- Snapshot BEFORE the delete, while the live swipe rows still exist, so the
  -- partner keeps the matches they already had. Same reasoning as
  -- delete_my_data: room_matches is security_invoker, but inside a SECURITY
  -- DEFINER function the effective user owns the underlying tables and is not
  -- RLS-filtered, so the WHERE clause is what scopes this — it is load-bearing.
  INSERT INTO matches (room_id, item_id)
    SELECT room_id, item_id FROM room_matches WHERE room_id = p_room
    ON CONFLICT DO NOTHING;

  DELETE FROM members WHERE user_id = v_uid AND room_id = p_room; -- cascades swipes

  SELECT count(*) INTO v_remaining FROM members WHERE room_id = p_room;
  IF v_remaining = 0 THEN
    DELETE FROM rooms WHERE id = p_room; -- cascades remnants, snapshot included
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_room(uuid) TO authenticated;

-- ---- delete_my_data: now account-wide ----

CREATE OR REPLACE FUNCTION public.delete_my_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room  record;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Every room, not "the" room. Snapshot each one's matches before removing the
  -- membership, so each surviving partner keeps what they already matched on.
  FOR v_room IN SELECT room_id FROM members WHERE user_id = auth.uid() LOOP
    INSERT INTO matches (room_id, item_id)
      SELECT room_id, item_id FROM room_matches WHERE room_id = v_room.room_id
      ON CONFLICT DO NOTHING;
  END LOOP;

  DELETE FROM members WHERE user_id = auth.uid(); -- cascades swipes

  -- Any room this emptied goes too. Restricted to rooms that now have no
  -- members at all, so a room where the partner remains is untouched.
  DELETE FROM rooms r
   WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.room_id = r.id);

  -- The recovery half is unconditional. 014 returned early when the caller had
  -- no room, which meant an upgraded user who had left their room erased
  -- nothing at all.
  DELETE FROM recovery_codes WHERE user_id = auth.uid();

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NOT NULL THEN
    DELETE FROM recovery_redeem_attempts WHERE email = lower(v_email);
  END IF;
END;
$$;

COMMIT;
