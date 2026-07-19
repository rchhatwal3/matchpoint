-- Resolve a member's room without tripping RLS recursion.
-- Used by the policies below; SECURITY DEFINER bypasses RLS on members so a
-- policy on members can reference "my room" without recursively evaluating
-- itself. Call member_room_id(auth.uid()) for the current user's room.
CREATE OR REPLACE FUNCTION member_room_id(p_member uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT room_id FROM members WHERE id = p_member;
$$;

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;

-- Rooms: visible only to their own members. Joining a room happens through the
-- SECURITY DEFINER join_room() RPC, so no public/anonymous room SELECT is needed.
CREATE POLICY "rooms_select_members" ON rooms
  FOR SELECT USING (id = public.member_room_id(auth.uid()));

-- Rooms: either member may update their room, intended for the shared
-- `locations` list. Tradeoff: RLS cannot restrict WHICH columns an UPDATE
-- touches, so this policy technically lets a member update any rooms column
-- (e.g. code). Acceptable here: the only other columns are code/created_at,
-- the room is only visible to its 2 members, and the app only ever updates
-- locations. Column-level hardening (a trigger or column GRANTs) can be added
-- later if needed.
CREATE POLICY "rooms_update_members" ON rooms
  FOR UPDATE
  USING (id = public.member_room_id(auth.uid()))
  WITH CHECK (id = public.member_room_id(auth.uid()));

-- Members: see everyone in your own room; your own row is always visible.
CREATE POLICY "members_select_same_room" ON members
  FOR SELECT USING (
    id = auth.uid() OR room_id = public.member_room_id(auth.uid())
  );

-- Members: you may only insert your own row (id must equal your uid).
CREATE POLICY "members_insert_self" ON members
  FOR INSERT WITH CHECK (id = auth.uid());

-- Items: readable by any signed-in user. Supabase anonymous sessions carry the
-- 'authenticated' role, so this covers them too.
CREATE POLICY "items_select_authenticated" ON items
  FOR SELECT USING (auth.role() = 'authenticated');

-- Swipes: read swipes belonging to members of your own room (yours + partner's).
-- A member of room A therefore never sees room B's swipes.
CREATE POLICY "swipes_select_same_room" ON swipes
  FOR SELECT USING (
    public.member_room_id(swipes.member_id) = public.member_room_id(auth.uid())
  );

-- Swipes: insert/update only your own rows.
CREATE POLICY "swipes_insert_own" ON swipes
  FOR INSERT WITH CHECK (member_id = auth.uid());

CREATE POLICY "swipes_update_own" ON swipes
  FOR UPDATE USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());
