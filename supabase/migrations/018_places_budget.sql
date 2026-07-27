-- 018_places_budget.sql
-- Cost-abuse budget for the get-restaurants edge function.
--
-- The function's room-locations guard is self-authorizing: 004_grants.sql:12
-- grants members UPDATE on rooms, so a caller writes their own allowlist, then
-- calls the function with a fresh random location string every iteration. Each
-- fresh string misses the cache (the cache lookup is `.eq('location', loc)`) and
-- costs up to 3 Places Text Search calls, up to 60 Place Photo media calls and
-- up to 60 Foursquare search calls against the owner's billing account, plus up
-- to 60 junk rows in the shared `items` table. Two bounds, together:
--   1. rooms.locations is capped at 10 entries (below), so the honest fan-out in
--      SessionProvider.getItems stays bounded.
--   2. places_lookups (below) backs a per-user cap of 50 cache-missing lookups
--      per 24h, enforced in the edge function. This is the non-bypassable one:
--      the row it counts is written by the service_role and clients cannot
--      touch the table at all.

-- Cap the room's shared location list. array_length of an empty array is NULL,
-- hence the coalesce — an empty `locations` must pass.
--
-- NOT VALID on purpose: nothing has ever bounded this column, so a live room may
-- already hold more than 10 entries (an already-exploited room certainly would),
-- and a validating ALTER would abort the whole migration on the first such row.
-- NOT VALID still enforces the constraint on every future INSERT and UPDATE,
-- which is the entire attack path. To validate later, once the offenders are
-- trimmed:
--   SELECT id, array_length(locations,1) FROM rooms
--    WHERE coalesce(array_length(locations,1),0) > 10;   -- fix these first
--   ALTER TABLE rooms VALIDATE CONSTRAINT rooms_locations_max_10;
ALTER TABLE rooms
  ADD CONSTRAINT rooms_locations_max_10
  CHECK (coalesce(array_length(locations, 1), 0) <= 10) NOT VALID;

-- One row per cache-missing get-restaurants request that actually went upstream.
-- Cache hits never write here, so a normal user only spends budget on locations
-- that have not been sourced yet.
CREATE TABLE IF NOT EXISTS places_lookups (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  at      timestamptz NOT NULL DEFAULT now()
);

-- The only query shape: count this user's rows inside the trailing window, and
-- delete this user's rows older than it.
CREATE INDEX IF NOT EXISTS places_lookups_user_at_idx ON places_lookups (user_id, at);

-- RLS on with zero policies: default-deny for anon and authenticated, so the
-- ledger is neither readable nor writable by clients (same shape as
-- recovery_codes in 011). service_role bypasses RLS but still needs the table
-- GRANT — this project has no blanket grants, which broke the function twice
-- already (007_service_role_grants.sql, 012_service_role_room_grants.sql).
ALTER TABLE places_lookups ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
-- SELECT to count the window, INSERT to record a lookup, DELETE to prune.
GRANT SELECT, INSERT, DELETE ON public.places_lookups TO service_role;

-- Pruning: the edge function deletes this user's rows older than the 24h window
-- on every budget check, so the table stays at roughly one window's worth of
-- rows per active user and cannot grow without bound. No cron job is required.

-- MANUAL: apply this migration BEFORE redeploying get-restaurants. The function
-- fails closed when the ledger is unreachable, so a deployed-but-unmigrated
-- backend returns "Could not load restaurants" for every cache-missing request.
