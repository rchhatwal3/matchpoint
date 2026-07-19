-- 004_grants.sql
-- Table-level grants for the authenticated role (anonymous sessions run as
-- 'authenticated'). Newer Supabase projects do not blanket-grant table
-- privileges on public, so RLS alone is not enough: the role needs the
-- coarse grant first, then RLS narrows rows.
-- No grants to 'anon': the app always establishes a session before querying.
-- create_room/join_room are SECURITY DEFINER, so they need no table grants.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON public.items TO authenticated;
GRANT SELECT, UPDATE ON public.rooms TO authenticated;
GRANT SELECT, INSERT ON public.members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.swipes TO authenticated;
GRANT SELECT ON public.room_matches TO authenticated;
