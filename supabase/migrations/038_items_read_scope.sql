-- 038_items_read_scope.sql
-- `items` stops being world-readable to every signed-in session.
--
-- WHAT WAS OPEN. 002_rls.sql:44-45 says any signed-in user may read every row
-- of `items`, and 004_grants.sql:11 grants them SELECT. Anonymous sign-in is
-- open, so "every signed-in user" means anyone. `items.location` therefore
-- enumerates every location any room has ever searched. Verified live by the
-- 2026-07-28 review and filed P3 because the rows are UNLINKED — `items` has no
-- room, user or timestamp column, so a location cannot be tied to a couple. It
-- becomes P2 the day `items` gains one.
--
-- WHY THIS WAS CALLED UNFIXABLE, and what changed. The backlog recorded it as
-- having "no clean fix while the restaurant catalogue is shared across rooms":
-- one room's cached rows are exactly what another room gets to reuse, so the
-- rows cannot be partitioned by room. That is still true — but the reader does
-- not need the whole catalogue. A caller only ever legitimately reads a
-- location-tagged row for a location their own room saved, or one they have
-- already swiped or matched. Scoping the READ leaves the CACHE shared.
--
-- THE FOUR READ PATHS THIS MUST NOT BREAK, all in providers/SessionProvider.tsx:
--   :540  the non-restaurant deck — food, vacations, activities, date_nights,
--         shows. Those rows carry location NULL (001:26-29) and stay readable to
--         everyone, which is the first arm below.
--   :62   the restaurants fallback, used when the edge function fails. Reads by
--         category + location, for a location on the caller's own room.
--   :384  the realtime match announce, which reads one item BY ID — the partner
--         just swiped it in a room the caller is in.
--   :590  getMatches, through `room_matches`, which is `security_invoker` and
--         joins `items` (033), so it reads `items` AS THE CALLER. Without the
--         swipe/match arms, removing a city from a room would make its already
--         matched restaurants vanish from Matches and from Date Night.
-- get-restaurants reads `items` with the service client (index.ts:204,275),
-- which is not RLS-filtered and is unaffected.
--
-- WHY A SECURITY DEFINER HELPER AND NOT AN INLINE POLICY EXPRESSION. Two
-- reasons, both load-bearing:
--   a. A policy expression is evaluated with the READER's privileges, and 030
--      deliberately reduced their grant on `matches` to specific columns. An
--      inline EXISTS over `matches` would depend on that grant and could fail
--      with 42501 instead of returning false.
--   b. It keeps `items`' policy from re-entering the policies on members, rooms,
--      swipes and matches on every row — the same recursion argument that put
--      `is_room_member` in `private` to begin with (034:18).
--
-- THE SNAPSHOT ARM CARRIES 030's CUT-OFF. `matched_at >= joined_at` is repeated
-- here, not assumed: this helper is not RLS-filtered, so without it a member who
-- joined after an erasure could read an item their own `matches` policy (034:103)
-- refuses them. The two predicates must stay in step.
--
-- ---------------------------------------------------------------------------
-- HOW THIS IS APPLIED
-- ---------------------------------------------------------------------------
-- By a human, by hand, in the Supabase SQL editor. Nothing in CI applies
-- migrations. 034 must already be applied (this reuses the `private` schema it
-- and 026 set up, and mirrors its matches predicate). The DROP POLICY below is
-- deliberately not IF EXISTS: if 002's policy is not there under that name, the
-- live schema is not what this file was written against and the apply should
-- abort rather than leave `items` with no SELECT policy at all.

BEGIN;

-- Same shape, grants and reasoning as private.is_room_member (034:18-35).
CREATE OR REPLACE FUNCTION private.can_read_item(p_item uuid, p_location text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- The location-independent catalogue: food, vacations, activities,
  -- date_nights, shows. Nothing about these is per-room and every deck needs
  -- them, so they stay readable to any signed-in caller — as before.
  SELECT p_location IS NULL
      -- A location saved on one of the caller's own rooms. This is the deck
      -- path, and the only arm that can be true for a row the caller has never
      -- interacted with.
      OR EXISTS (
           SELECT 1
             FROM members m
             JOIN rooms r ON r.id = m.room_id
            WHERE m.user_id = auth.uid()
              AND p_location = ANY (r.locations)
         )
      -- Already swiped in a room the caller belongs to — theirs or their
      -- partner's swipe. Survives the room dropping the location afterwards.
      OR EXISTS (
           SELECT 1
             FROM swipes s
             JOIN members m ON m.user_id = auth.uid() AND m.room_id = s.room_id
            WHERE s.item_id = p_item
         )
      -- In the erasure snapshot for a room the caller belongs to, gated on the
      -- same cut-off as 034:103-107.
      OR EXISTS (
           SELECT 1
             FROM matches ms
             JOIN members m ON m.user_id = auth.uid() AND m.room_id = ms.room_id
            WHERE ms.item_id = p_item
              AND ms.matched_at >= m.joined_at
         );
$$;

-- anon and authenticated revoked BY NAME as well as FROM PUBLIC: an explicit
-- grant from ALTER DEFAULT PRIVILEGES survives a REVOKE FROM PUBLIC (026:83-85).
REVOKE ALL ON FUNCTION private.can_read_item(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_read_item(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_item(uuid, text) TO authenticated;

-- One transaction, so `items` is never left without a SELECT policy: with RLS
-- enabled and no policy, every read returns nothing and every deck in the app
-- is empty.
DROP POLICY "items_select_authenticated" ON items;

CREATE POLICY "items_select_scoped" ON items
  FOR SELECT USING (private.can_read_item(id, location));

-- The table grant from 004_grants.sql:11 is untouched and still required: RLS
-- narrows a privilege, it does not confer one.

-- The new predicate looks items up by item_id alone. Neither table has an index
-- that serves that: swipes' primary key is (user_id, room_id, item_id) and
-- matches' is (room_id, item_id), both leading with a different column. They
-- matter because a SECURITY DEFINER function cannot be inlined into the policy,
-- so these EXISTS run per row rather than folding into one plan.
--
-- Plain CREATE INDEX, not CONCURRENTLY: concurrently cannot run inside a
-- transaction block, and this must not commit without the policy. It takes a
-- write lock on both tables for the build — at 398 swipes and 26 matches that is
-- milliseconds. Revisit if either table ever grows by orders of magnitude.
CREATE INDEX IF NOT EXISTS swipes_item_id_idx ON public.swipes (item_id);
CREATE INDEX IF NOT EXISTS matches_item_id_idx ON public.matches (item_id);

COMMIT;

-- ---------------------------------------------------------------------------
-- PROBE — run these after applying
-- ---------------------------------------------------------------------------
-- The ones that matter are live, as an ordinary anonymous caller holding only
-- the public key, because that is the role the finding is about. In the SQL
-- editor you are the owner and RLS does not apply to you.
--
--   (a) enumeration closed: a fresh session in no rooms
--       GET /rest/v1/items?select=location&category=eq.restaurants
--       expect 0 rows (before this file: every location ever searched)
--
--   (b) deck unbroken: a session in a room with `Seattle, WA` saved
--       GET /rest/v1/items?select=id,title&category=eq.restaurants&location=eq.Seattle,%20WA
--       expect the same rows it returned before
--
--   (c) catalogue unbroken: any session
--       GET /rest/v1/items?select=id&category=eq.food
--       expect the full seeded list
--
--   (d) the regression this design exists for: match a restaurant, remove that
--       city from the room, then read /rest/v1/room_matches?room_id=eq.<room>
--       expect the match still there, with its title and image
--
-- And one owner-side check that the grants came out right:
--   SELECT has_function_privilege('authenticated', 'private.can_read_item(uuid, text)', 'EXECUTE') AS granted,
--          has_function_privilege('anon', 'private.can_read_item(uuid, text)', 'EXECUTE') AS anon_granted;
--   -- expect true, false
