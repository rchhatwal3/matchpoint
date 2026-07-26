-- 012_service_role_room_grants.sql
-- The get-restaurants edge function (service_role) enforces the room-location
-- guard added in PR #2: it reads the caller's `members.room_id` and that room's
-- `rooms.locations` before allowing a Places lookup. On this project service_role
-- has no blanket grants (see 007), and 007 only granted `items` — so those two
-- SELECTs fail with 42501 "permission denied", the guard reads null, and every
-- request returns "No room" (403). The restaurants deck is dead without this.
-- Grant exactly what the guard reads: SELECT on members + rooms. Nothing more.

GRANT SELECT ON public.members TO service_role;
GRANT SELECT ON public.rooms TO service_role;
