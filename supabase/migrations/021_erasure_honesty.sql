-- 021_erasure_honesty.sql
-- Makes delete_my_data() tell the truth in both directions (2026-07-27
-- adversarial QA, the two P2s + the recovery_redeem_attempts retention P3).
--
-- Direction 1 — it erased too much. Deleting the caller's `members` row cascades
-- their `swipes` (001:35), and `room_matches` requires
-- `count(DISTINCT s.member_id) = 2` (001:84), so no item in that room can ever
-- satisfy the HAVING clause again: the surviving partner's ENTIRE match history
-- vanishes, silently and permanently, while `app/settings.tsx:101` ("Shared
-- matches stay with your partner unless they also delete") and the published
-- policy (`lib/legal/content/privacy.ts:113`) both promise it survives. Fixed by
-- snapshotting the room's matches into `matches` before the delete, and making
-- `room_matches` read live rows UNION the snapshot.
--
-- Direction 2 — it erased too little. It touched only `members`/`rooms`, leaving
-- `recovery_codes` (their ON DELETE CASCADE hangs off auth.users, which nothing
-- deletes) and `recovery_redeem_attempts` (raw email, no cascade, no retention
-- bound) intact, contradicting the erasure promise at privacy.ts:87-102. Fixed
-- below, plus a 30-day purge so the email log stops growing forever.

-- Snapshot of a room's matches, written ONLY by delete_my_data() just before the
-- swipe cascade takes the live rows away.
--
-- Room + item, and NOTHING about who swiped. That is the whole design
-- constraint, not an omission: this row is written at the exact moment a user
-- exercises erasure, so any member_id / uid / display_name / timestamp-of-their-
-- swipe carried along would be retained personal data about the person who just
-- asked to be forgotten — a worse compliance position than the bug this fixes.
-- A match is a joint artifact of two people and the surviving partner has their
-- own claim to it; the pair (room_id, item_id) is exactly that joint fact and no
-- more. `matched_at` is when the snapshot was taken, not when either person
-- swiped, so it says nothing about the departing member's activity.
--
-- The room FK cascade is deliberate: when the last member leaves, the room goes
-- and the snapshot goes with it. Nobody is left with a claim to those matches.
CREATE TABLE IF NOT EXISTS matches (
  room_id    uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  matched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, item_id)
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Same shape as every other read policy in 002: scoped through the
-- member_room_id() SECURITY DEFINER helper, which resolves "my room" without
-- tripping RLS recursion on `members`. A user with no member row (including the
-- one who just erased) gets NULL, which matches nothing.
CREATE POLICY "matches_select_same_room" ON matches
  FOR SELECT USING (room_id = public.member_room_id(auth.uid()));

-- This project has no blanket grants (004): RLS alone would still be a
-- permission-denied. SELECT only, and only to authenticated — clients must never
-- be able to forge, edit or destroy a snapshot row. delete_my_data() is
-- SECURITY DEFINER and so needs no grant of its own to write here.
GRANT SELECT ON public.matches TO authenticated;

-- room_matches: live matches UNION the snapshot. Re-created rather than replaced
-- by a second view so the client needs no change at all — same view name, same
-- columns, same order (`SessionProvider.getMatches` selects them by name at
-- providers/SessionProvider.tsx:446).
--
-- CREATE OR REPLACE, not DROP + CREATE: replacing preserves the existing
-- `GRANT SELECT ON public.room_matches TO authenticated` from 004:15, which a
-- DROP would silently take with it.
--
-- security_invoker stays true, so both arms are still RLS-filtered as the
-- caller: the live arm through the swipes/members policies, the snapshot arm
-- through matches_select_same_room above.
--
-- UNION, not UNION ALL: a match that is both still-live and already-snapshotted
-- (the room refilled with a second member who liked the same item) must appear
-- once, or the client renders a duplicate card.
CREATE OR REPLACE VIEW room_matches
WITH (security_invoker = true) AS
  (SELECT
    m.room_id,
    s.item_id,
    i.category,
    i.title,
    i.subtitle,
    i.image_url
  FROM swipes s
  JOIN members m ON m.id = s.member_id
  JOIN items i ON i.id = s.item_id
  WHERE s.liked = true
  GROUP BY m.room_id, s.item_id, i.category, i.title, i.subtitle, i.image_url
  HAVING count(DISTINCT s.member_id) = 2)
  UNION
  (SELECT
    ms.room_id,
    ms.item_id,
    i.category,
    i.title,
    i.subtitle,
    i.image_url
  FROM matches ms
  JOIN items i ON i.id = ms.item_id);

-- delete_my_data: same signature, same grant, same shared-room policy as 014.
-- What changed: it snapshots first, it erases the recovery data too, and it no
-- longer returns early for a caller with no room.
--
-- NOT deleted here: the `auth.users` row itself, which for an upgraded account
-- holds the user's email. SQL cannot reach the admin API cleanly, so that half
-- lives in an edge function named `delete-account`, which calls this RPC and
-- then deletes the auth user with the service_role admin client. Until that
-- function ships and the client calls it instead of this RPC directly, the email
-- still survives erasure — this migration closes everything except that one row.
CREATE OR REPLACE FUNCTION delete_my_data() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room_id uuid;
  v_remaining int;
  v_email text;
BEGIN
  -- Same opening guard as create_room/join_room (019:61,112). PostgREST always
  -- has a session here, so this is a backstop against a NULL uid silently
  -- matching nothing.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT room_id INTO v_room_id FROM members WHERE id = auth.uid();

  -- The room half is conditional; the recovery half below is NOT. 014 returned
  -- here when v_room_id was NULL, which meant an anonymous user who upgraded,
  -- generated recovery codes, then left their room erased nothing at all.
  IF v_room_id IS NOT NULL THEN
    -- Snapshot BEFORE the delete, while the live rows still exist.
    -- Why this sees every match in the room: room_matches is security_invoker,
    -- but inside a SECURITY DEFINER function the effective user is the function
    -- owner, who owns the underlying tables and is therefore not RLS-filtered.
    -- The `WHERE room_id = v_room_id` clause is what scopes this to the caller's
    -- own room — it is load-bearing, not an optimisation.
    -- ON CONFLICT DO NOTHING makes a repeat erasure (or a partner erasing later)
    -- a no-op on rows already snapshotted.
    INSERT INTO matches (room_id, item_id)
      SELECT room_id, item_id FROM room_matches WHERE room_id = v_room_id
      ON CONFLICT DO NOTHING;

    DELETE FROM members WHERE id = auth.uid(); -- cascades swipes (FK ON DELETE CASCADE)
    SELECT count(*) INTO v_remaining FROM members WHERE room_id = v_room_id;
    IF v_remaining = 0 THEN
      DELETE FROM rooms WHERE id = v_room_id; -- cascades any remnants, snapshot included
    END IF;
  END IF;

  -- Salted hashes, but still a personal-data linkage to this user id.
  DELETE FROM recovery_codes WHERE user_id = auth.uid();

  -- recovery_redeem_attempts is keyed by email, not user_id, so it has to be
  -- resolved through auth.users (the same reachability problem 011:52 solved for
  -- the redeem function). Anonymous users have no email and no attempts row, so
  -- NULL simply skips this. lower() because redeem-recovery-code normalises with
  -- trim().toLowerCase() before writing (redeem-recovery-code/index.ts:28).
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NOT NULL THEN
    DELETE FROM recovery_redeem_attempts WHERE email = lower(v_email);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_my_data() TO authenticated;

-- 30-day retention on recovery_redeem_attempts (the P3). The table logs a raw
-- email on every redeem attempt with no cascade and no bound, so it accumulates
-- addresses forever — including for users who have since erased. The delete
-- above handles the erasing user; this handles everyone else's stale rows.
-- 30 days is far longer than the 15-minute lockout window that is the only thing
-- these rows are read for, so nothing operational depends on the tail.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Re-runnable: cron.unschedule() raises when the job is absent, so guard it. A
-- fresh database has no job and skips straight to the schedule below.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge_recovery_redeem_attempts') THEN
    PERFORM cron.unschedule('purge_recovery_redeem_attempts');
  END IF;
END;
$$;

-- Schema-qualified: cron jobs run with their own search_path, not this file's.
SELECT cron.schedule(
  'purge_recovery_redeem_attempts',
  '17 3 * * *',
  $job$DELETE FROM public.recovery_redeem_attempts WHERE attempted_at < now() - interval '30 days'$job$
);

-- MANUAL: pg_cron must be enabled for the project (Dashboard → Database →
-- Extensions → pg_cron) before this migration is applied; the CREATE EXTENSION
-- above needs a privileged role and will fail otherwise. If it does, everything
-- above it in this file is still correct and applies independently — re-run only
-- the pg_cron block once the extension is on. Verify with:
--   SELECT jobname, schedule, active FROM cron.job;
