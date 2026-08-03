-- 023_places_budget_atomic.sql
-- The P1 from the 2026-07-28 review: the Places lookup budget bounds nothing.
--
-- 018 called the per-user cap "the non-bypassable one" (018:13-16). It is
-- bypassable two independent ways, and both are fixed here:
--
--   1. Concurrency. get-restaurants/index.ts:140-163 counts, checks, then inserts
--      as three separate PostgREST calls with no lock and no transaction. N
--      simultaneous requests all read the same pre-burst count, all pass the
--      check, and all go upstream. The cache short-circuit at index.ts:82-85 does
--      not help — it runs before any of them has written a row either.
--   2. Free identities. The budget keys on user_id while the threat model is
--      unlimited anonymous sessions (this app has no accounts — Supabase
--      anonymous auth). Every fresh signup arrives with a fresh 50-lookup
--      allowance, so a per-user cap places no ceiling on the provider bill.
--
-- Fix 1 is the advisory lock + single transaction below. Fix 2 is a global daily
-- ceiling counted in the same locked transaction.

-- ---------------------------------------------------------------------------
-- 1. The two limits, in a row a human can edit without a migration
-- ---------------------------------------------------------------------------
-- Both numbers are operational knobs, not schema: the right global ceiling
-- depends on live traffic and on what the provider bill is allowed to reach, and
-- whoever is watching that bill must be able to change it from the SQL editor at
-- 2am. Hence a one-row table rather than a constant baked into the function:
--   UPDATE places_budget SET global_daily_limit = 400 WHERE id = 1;
--
-- global_daily_limit = 200. Cost basis: one cache-missing lookup is up to 3
-- Places Text Search Pro calls (~$0.035 each) plus up to 60 Place Photo calls
-- (~$0.007 each) plus up to 60 Foursquare searches — roughly $0.50 of provider
-- spend, worst case. 200 caps that at ~$100/day instead of "however many
-- anonymous signups the attacker scripts".
--
-- Headroom, stated honestly. For locations that fill the cache, rooms.locations
-- is capped at 10 (018:30-32) and cache hits never spend, so a brand-new room
-- costs 10 and 200/day is ~20 entirely new fully-populated rooms — far above
-- current usage. That is an upper bound, NOT the general case: the cache
-- short-circuit is `existing.length >= CACHE_TARGET` with CACHE_TARGET = 60
-- (index.ts:29,82), so a location Places returns fewer than 60 results for never
-- reaches the threshold and spends a lookup on EVERY request, forever. A room
-- with three small-town locations burns its user's 50/day just re-opening those
-- decks, and a few such rooms drain the shared global 200 for everyone. This is
-- pre-existing behaviour that the budget makes visible rather than causes; the
-- real remedy is a negative-cache marker so a legitimately sparse location stops
-- re-querying. Until then treat 200 as the bill ceiling, not a usage estimate.
--
-- KNOWN TRADEOFF, deliberate: a global ceiling is a shared resource, so an
-- attacker who burns it denies honest users their *new-location* lookups for the
-- rest of the window (already-cached locations keep serving from `items`, so the
-- app degrades rather than breaks). With user_daily_limit = 50 that takes 4
-- anonymous identities. Bounding the bill is worth bounded degradation; if it
-- ever bites, lower user_daily_limit — that raises the identity count an
-- attacker needs to exhaust the global pool, and it is the same one-line UPDATE.
CREATE TABLE IF NOT EXISTS places_budget (
  id                 int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  user_daily_limit   int NOT NULL CHECK (user_daily_limit > 0),
  global_daily_limit int NOT NULL CHECK (global_daily_limit > 0)
);

INSERT INTO places_budget (id, user_daily_limit, global_daily_limit)
  VALUES (1, 50, 200)
  ON CONFLICT (id) DO NOTHING;

-- RLS on with zero policies: default-deny for anon and authenticated, same shape
-- as places_lookups (018:52) and recovery_codes (011). No GRANTs to any role —
-- not even service_role. The only reader is the SECURITY DEFINER function below,
-- which runs as this table's owner and so is subject to neither the grants nor
-- the RLS. A client that could read the limits could time its burst around them.
ALTER TABLE places_budget ENABLE ROW LEVEL SECURITY;

-- The global count is `WHERE at >= since` with no user_id, which the existing
-- places_lookups_user_at_idx (018:45) cannot lead with. The prune uses this too.
CREATE INDEX IF NOT EXISTS places_lookups_at_idx ON places_lookups (at);

-- ---------------------------------------------------------------------------
-- 2. One transaction: lock, count, insert, verdict
-- ---------------------------------------------------------------------------
-- Same mechanism 022:75-84 used for the member-cap TOCTOU. pg_advisory_xact_lock
-- serialises the count against every other spend and releases at transaction end,
-- so it needs no explicit unlock and none on rollback either. One function body
-- is one transaction, so the count that authorised the spend and the row that
-- records it commit together or not at all.
--
-- ADVISORY LOCK SALT: 1 = the Places budget namespace. 022:78 uses salt 0 for the
-- per-room member cap. Salts keep the two namespaces from colliding on a shared
-- 64-bit lock space; a new lock namespace takes the next unused salt.
--
-- The lock key is a CONSTANT, not per-user, unlike 022's per-room key. That is
-- required, not sloppy: the global ceiling counts rows across all users, so two
-- different users' spends must serialise against each other or the global check
-- has exactly the race this migration exists to close. The cost is that all
-- cache-missing lookups queue — acceptable, because that is at most
-- global_daily_limit of them per day and each holds the lock for two counts and
-- an insert.
--
-- Returns a verdict string rather than raising, because "you are over budget" is
-- an ordinary 429 the edge function must render as a message, not an error path.
-- The caller treats any unrecognised return (and any raise) as fail-closed —
-- see lookupRefusal in get-restaurants/logic.ts.
CREATE OR REPLACE FUNCTION spend_places_lookup(p_user uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_since        timestamptz := now() - interval '24 hours';
  v_user_limit   int;
  v_global_limit int;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('places_budget', 1));

  SELECT user_daily_limit, global_daily_limit
    INTO v_user_limit, v_global_limit
    FROM places_budget WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'places_budget_unconfigured';
  END IF;

  -- User cap first: when a caller is over both, the one that is actually their
  -- own doing is the more useful thing to tell them.
  IF (SELECT count(*) FROM places_lookups
       WHERE user_id = p_user AND at >= v_since) >= v_user_limit THEN
    RETURN 'user_limit';
  END IF;

  IF (SELECT count(*) FROM places_lookups WHERE at >= v_since) >= v_global_limit THEN
    RETURN 'global_limit';
  END IF;

  INSERT INTO places_lookups (user_id, at) VALUES (p_user, now());

  -- Prune, now global rather than per-user (018:58-60 pruned only the caller's
  -- rows). Rows outside the window are dead to both counts, and doing it inside
  -- the lock means it cannot race the counts above. Keeps the table at roughly
  -- one window's worth of rows with no cron job.
  DELETE FROM places_lookups WHERE at < v_since;

  RETURN 'ok';
END;
$$;

-- service_role ONLY, same shape as replace_recovery_codes (022:174-175). The
-- REVOKE is not optional: PostgreSQL grants EXECUTE to PUBLIC on every new
-- function, and PUBLIC here would hand anon a way to burn the global ceiling
-- directly, without even paying for a Places call.
-- anon and authenticated are revoked BY NAME, not just via PUBLIC. Supabase
-- projects commonly carry `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL
-- ON FUNCTIONS TO anon, authenticated`, which attaches *explicit* grants to
-- those roles at CREATE time — and an explicit grant is not removed by a REVOKE
-- FROM PUBLIC. Without these two lines, any anonymous client could call this
-- over PostgREST and burn the shared global ceiling directly: no room, no
-- location allowlist, no Places bill, just a free denial of new-location
-- lookups for every user. Verify after applying:
--   SELECT proacl FROM pg_proc WHERE proname = 'spend_places_lookup';
REVOKE ALL ON FUNCTION spend_places_lookup(uuid) FROM public;
REVOKE ALL ON FUNCTION spend_places_lookup(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION spend_places_lookup(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Collapse duplicate items, then make duplicates impossible
-- ---------------------------------------------------------------------------
-- Secondary damage from the same race: index.ts:102-113 computes its dedupe set
-- from `existing`, read BEFORE the third-party call, and `items` has no unique
-- constraint. Concurrent requests for one location each insert their own copy of
-- the same restaurants. This fires on the honest path too — both partners opening
-- a new location's deck at the same time is the normal case, not an attack.
--
-- A UNIQUE constraint cannot be added NOT VALID (unlike the CHECKs in 018 and
-- 022), so existing violators would abort this migration on apply. Duplicates are
-- expected to exist: the review records 20 rows whose `location` is a
-- 1,000-character run of 'A' from before the 80-char cap, written by exactly the
-- concurrent path above. This block therefore collapses ANY duplicate rather than
-- assuming a shape — it is written blind, against no live database.
--
-- Scoped to `location IS NOT NULL`. The constraint uses PostgreSQL's default
-- NULLS DISTINCT, so location-independent catalog rows (food, vacations, shows —
-- 001:26-29) never conflict with each other and must not be touched here. That
-- also means this constraint does NOT dedupe the seeded catalog; it only
-- constrains location-tagged rows, which is the entire scope of this finding.
-- EXPLICIT TRANSACTION, NOT OPTIONAL. Everything from here to COMMIT must be
-- all-or-nothing: the swipes/matches repoint below has to survive or the DELETE
-- that follows it must not run. `swipes.item_id` and `matches.item_id` are both
-- ON DELETE CASCADE (001:36, 021:38), so a DELETE that runs after a failed
-- repoint destroys real user swipes and matches permanently and silently.
-- Applying this file statement-by-statement — the SQL editor, `psql -f` without
-- -1, any tooling that autocommits per statement — is exactly that scenario.
-- Relying on an implicit transaction is not enough; declare one.
BEGIN;

-- Blocks concurrent writers for the rest of the transaction. Without it, the
-- old (racy) get-restaurants is still deployed while this runs — that is the
-- mandated apply order, see the note at the end of this file — so a live
-- request can commit a new duplicate after the snapshot below is taken. That
-- row is absent from the map, survives the DELETE, and then fails ADD
-- CONSTRAINT.
LOCK TABLE items IN EXCLUSIVE MODE;

-- DROP first: a real table, not TEMP, so an apply that aborted partway leaves
-- it behind and every retry would fail here with "already exists" before ever
-- reaching the constraint.
DROP TABLE IF EXISTS items_dupe_map;

-- Keeper preference: duplicates are NOT interchangeable. resolvePhotoUrl
-- returns null on any photo failure and price_level stays null until Foursquare
-- fills it, so picking blind by uuid can keep the impoverished copy and delete
-- the enriched one — irreversible once the DELETE below runs. Prefer a row with
-- an image and a price, then fall back to id for a deterministic result.
CREATE TABLE items_dupe_map AS
  SELECT id AS dupe_id,
         first_value(id) OVER (
           PARTITION BY category, title, location
           ORDER BY (image_url IS NULL), (price_level IS NULL), id
         ) AS keep_id
    FROM items
   WHERE location IS NOT NULL;

DELETE FROM items_dupe_map WHERE dupe_id = keep_id;

-- Repoint swipes before deleting the rows they point at — swipes.item_id is
-- ON DELETE CASCADE (001:36), so deleting a duplicate silently destroys real
-- user swipes and, through them, matches. INSERT ... ON CONFLICT rather than
-- UPDATE because a member may have swiped both the duplicate and the keeper,
-- which would collide on the (member_id, item_id) primary key. `liked OR` on
-- conflict: a like on either copy survives, so no existing match is lost.
-- GROUP BY is load-bearing, not tidiness. ON CONFLICT DO UPDATE raises "command
-- cannot affect row a second time" if the source produces two rows with the same
-- conflict key, and that is the normal case here: three copies A(keep)/B/C, a
-- member who swiped both B and C, and the join emits (member, A) twice. That is
-- precisely the state this block exists to repair — N concurrent requests made N
-- copies, and selectRestaurants returns all of them, so all of them get swiped.
-- bool_or preserves a like on any copy; min keeps the earliest swipe time.
INSERT INTO swipes (member_id, item_id, liked, created_at)
  SELECT s.member_id, m.keep_id, bool_or(s.liked), min(s.created_at)
    FROM swipes s
    JOIN items_dupe_map m ON m.dupe_id = s.item_id
   GROUP BY s.member_id, m.keep_id
  ON CONFLICT (member_id, item_id)
  DO UPDATE SET liked = swipes.liked OR excluded.liked;

-- Same for the erasure snapshot (021:36-41), also ON DELETE CASCADE.
INSERT INTO matches (room_id, item_id, matched_at)
  SELECT ms.room_id, m.keep_id, ms.matched_at
    FROM matches ms
    JOIN items_dupe_map m ON m.dupe_id = ms.item_id
  ON CONFLICT (room_id, item_id) DO NOTHING;

DELETE FROM items WHERE id IN (SELECT dupe_id FROM items_dupe_map);

DROP TABLE items_dupe_map;

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_category_title_location_key;
ALTER TABLE items
  ADD CONSTRAINT items_category_title_location_key
  UNIQUE (category, title, location);

COMMIT;

-- The over-long junk locations are deliberately NOT deleted here. Deduping them
-- is required (they would block the constraint); deleting them is a data call for
-- a human with the live table in front of them, and it cascades into swipes. To
-- review and remove them afterwards:
--   SELECT id, title, length(location) FROM items WHERE length(location) > 80;
--   DELETE FROM items WHERE length(location) > 80;   -- cascades swipes/matches

-- MANUAL: apply this migration BEFORE deploying the get-restaurants change that
-- calls spend_places_lookup. The function fails closed on an unknown RPC, so a
-- deployed-but-unmigrated backend returns "Could not load restaurants" for every
-- cache-missing request. The reverse order is safe: an unmigrated function against
-- a migrated DB just keeps using the old (racy) three-call path.
