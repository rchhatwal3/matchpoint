-- 015_room_price_tiers.sql
-- Shared, per-room restaurant price-tier filter (mirrors rooms.locations): both
-- partners see and edit one selection, synced live via the rooms realtime
-- publication (006). Tier 0 = "Unpriced". Default = every tier on (nothing
-- hidden) for existing + new rooms. Same column-write + RLS trust model as
-- locations (see 002_rls.sql): either member may UPDATE the row; column-level is
-- not restricted. No grant/RLS/publication change is needed — rooms UPDATE is
-- already granted to authenticated, RLS already scopes it to members, and rooms
-- is already in supabase_realtime.
--
-- MANUAL: apply this (SQL editor or `supabase db push`) BEFORE shipping a bundle
-- that selects price_tiers, or online room reads error with
-- "column rooms.price_tiers does not exist" (same rule that bit 009_item_price).

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS price_tiers smallint[] NOT NULL DEFAULT '{0,1,2,3,4}';
