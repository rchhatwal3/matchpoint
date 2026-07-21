-- 006_realtime_rooms.sql
-- The shared `rooms.locations` list is edited by either partner from the
-- Settings screen. For the other partner's screen to update live, rooms must be
-- in the supabase_realtime publication (005 added only members + swipes).
-- RLS still applies to delivered rows: a subscriber only receives room rows
-- their session can select (their own room, per the rooms_select_members policy).

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
