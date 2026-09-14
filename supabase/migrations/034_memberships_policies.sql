-- 034_memberships_policies.sql
-- T13 part 2: rewrite every policy that assumed one room per person.
--
-- private.member_room_id(uuid) is DROPPED, not adapted. Its whole contract is
-- "the one room this person is in", which no longer denotes anything. Two
-- replacements take the room as an argument instead.
--
-- GRANT SHAPE. Both helpers copy what 026 established for member_room_id:
-- owner postgres, SECURITY DEFINER, STABLE, EXECUTE revoked from PUBLIC and
-- granted to `authenticated` only. Not `anon`: Supabase anonymous sessions
-- carry the `authenticated` role (002:42-43), which is exactly why a REVOKE
-- alone could never have fixed the 026 oracle. They live in `private` because
-- PostgREST exposes only `public` and `graphql_public`; ADDING `private` TO THE
-- DASHBOARD'S EXPOSED-SCHEMA LIST REOPENS THAT ORACLE.

BEGIN;

CREATE OR REPLACE FUNCTION private.is_room_member(p_user uuid, p_room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM members WHERE user_id = p_user AND room_id = p_room
  );
$$;

-- anon and authenticated are additionally revoked BY NAME, same reasoning as
-- 026:83-85 and 030:161-163: an explicit grant from ALTER DEFAULT PRIVILEGES is
-- not removed by a REVOKE FROM PUBLIC.
REVOKE ALL ON FUNCTION private.is_room_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_room_member(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_room_member(uuid, uuid) TO authenticated;

-- Gains the room argument: a person now has one joined_at per room, and the
-- erasure cut-off below has to compare against the right one.
CREATE OR REPLACE FUNCTION private.member_joined_at(p_user uuid, p_room uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT joined_at FROM members WHERE user_id = p_user AND room_id = p_room;
$$;

-- anon and authenticated are additionally revoked BY NAME, same reasoning as
-- 026:83-85 and 030:161-163: an explicit grant from ALTER DEFAULT PRIVILEGES is
-- not removed by a REVOKE FROM PUBLIC.
REVOKE ALL ON FUNCTION private.member_joined_at(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.member_joined_at(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.member_joined_at(uuid, uuid) TO authenticated;

-- ---- policies ----
--
-- 033 already dropped members_select_same_room and the three swipes policies,
-- because they read the columns it removes. Those four use IF EXISTS so this
-- file re-creates them either way.

-- One expression covers both of the old halves: your own rows are in rooms you
-- belong to, and a partner's rows share a room_id you belong to.
DROP POLICY IF EXISTS members_select_same_room ON public.members;
CREATE POLICY members_select_same_room ON public.members
  FOR SELECT USING (private.is_room_member(auth.uid(), room_id));

DROP POLICY rooms_select_members ON public.rooms;
CREATE POLICY rooms_select_members ON public.rooms
  FOR SELECT USING (private.is_room_member(auth.uid(), id));

DROP POLICY rooms_update_members ON public.rooms;
CREATE POLICY rooms_update_members ON public.rooms
  FOR UPDATE
  USING (private.is_room_member(auth.uid(), id))
  WITH CHECK (private.is_room_member(auth.uid(), id));

-- Was private.member_room_id(member_id) = private.member_room_id(auth.uid()):
-- two resolutions of two different rows. Now one call, because the row carries
-- its own room.
DROP POLICY IF EXISTS swipes_select_same_room ON public.swipes;
CREATE POLICY swipes_select_same_room ON public.swipes
  FOR SELECT USING (private.is_room_member(auth.uid(), room_id));

-- The is_room_member half is belt-and-braces: swipes_membership_fkey already
-- makes a swipe naming a room you are not in unstorable. It is kept because a
-- policy that states its own intent is worth one call.
DROP POLICY IF EXISTS swipes_insert_own ON public.swipes;
CREATE POLICY swipes_insert_own ON public.swipes
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND private.is_room_member(auth.uid(), room_id));

DROP POLICY IF EXISTS swipes_update_own ON public.swipes;
CREATE POLICY swipes_update_own ON public.swipes
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- matched_at >= joined_at is 021's erasure control: a member who joins after a
-- match was snapshotted must not see it. It is now scoped to the right room,
-- which the old single-room signature could not express.
DROP POLICY matches_select_same_room ON public.matches;
CREATE POLICY matches_select_same_room ON public.matches
  FOR SELECT USING (
    private.is_room_member(auth.uid(), room_id)
    AND matched_at >= private.member_joined_at(auth.uid(), room_id)
  );

-- room_matches is not re-created here: 033 had to re-point it at swipes.room_id
-- before dropping swipes.member_id, and that is its one definition.

DROP FUNCTION private.member_room_id(uuid);
DROP FUNCTION private.member_joined_at(uuid);

COMMIT;
