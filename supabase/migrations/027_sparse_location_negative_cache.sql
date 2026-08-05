-- 027_sparse_location_negative_cache.sql
-- The P2 from the 2026-08-03 QA, and the remedy 023:44-46 said was owed.
--
-- get-restaurants short-circuited on `existing.length >= CACHE_TARGET` alone,
-- with CACHE_TARGET = 60. A location the upstream providers simply
-- have fewer than 60 results for can never reach that threshold, so EVERY
-- request for it is a cache miss: it spends a lookup against both budgets and
-- calls Google Places, forever. Found live: "New York, NY" holds 59 items and is
-- permanently stuck; Chicago, Seattle, Los Angeles and San Francisco sit at
-- exactly 60 and are fine. A room with a few sparse locations burns its user's
-- 50/day just re-opening those decks, and a handful of such rooms drain the
-- shared global 200/day for everyone else.
--
-- The count is the wrong question. "Are there 60 rows?" cannot distinguish "we
-- have not fetched this yet" from "we fetched it and 59 is all there is". This
-- migration records the second fact so the cache check can ask it directly.
--
-- No BEGIN/COMMIT here, unlike 023: every statement below is additive, and a
-- file that half-applies degrades to exactly the pre-migration behaviour,
-- because the edge function treats an erroring or unrecognised verdict as a
-- cache miss. There is nothing to lose halfway through.

-- ---------------------------------------------------------------------------
-- 1. How long a recorded outcome stays trustworthy
-- ---------------------------------------------------------------------------
-- 168 hours = 7 days. The restaurant set of a whole city moves on a scale of
-- months, so a week costs essentially nothing in freshness, while cutting a
-- sparse location's upstream traffic from once per deck open to once per week —
-- for the worst realistic room (rooms.locations is capped at 10, 018:30-32) that
-- is ~1.4 lookups a day instead of one per open, per partner. A week is also
-- short enough that any outcome recorded wrongly self-heals without anyone
-- having to notice, which is why this is not 30 days.
--
-- It lives on places_budget rather than in the function body for the same reason
-- the two limits do (023:23-27): it is an operational knob, and whoever is
-- watching the provider bill must be able to turn it from the SQL editor without
-- a migration.
--   UPDATE places_budget SET cache_ttl_hours = 24 WHERE id = 1;
-- Lowering it re-opens locations for fetching on their next request; raising it
-- extends the ones already recorded. Neither needs a deploy.
ALTER TABLE places_budget
  ADD COLUMN IF NOT EXISTS cache_ttl_hours int NOT NULL DEFAULT 168
  CHECK (cache_ttl_hours > 0);

-- ---------------------------------------------------------------------------
-- 2. The marker
-- ---------------------------------------------------------------------------
-- One row per (category, location) that has been fetched upstream to completion.
-- Keyed the same way as items' UNIQUE (category, title, location) from 023,
-- because this row makes a claim about exactly the query the cache check runs:
-- `.eq('category', ...).eq('location', ...)`.
--
-- `result_count` is what the fetch actually left in `items`, not what Google
-- returned. It is not read by the verdict below — freshness alone decides — but
-- it is the only record of WHY a location is being served short, and the first
-- thing anyone investigating "this deck is tiny" will want:
--   SELECT * FROM places_fetches ORDER BY result_count;
--
-- Growth is bounded by distinct locations ever fetched, not by request volume
-- (contrast places_lookups, one row per request, which is why 023:135-139 prunes
-- it inline). New rows only appear for locations never fetched before, and at
-- most global_daily_limit of those per day. There is deliberately no prune: an
-- expired row is already inert — the verdict returns 'miss' for it — so deleting
-- it would buy a few bytes at the cost of a DELETE on every recorded fetch.
--
-- The length CHECK is the same backstop 025 added to items.location, for the
-- same reason: the 80-character cap otherwise exists only in application code
-- (MAX_LOCATION_LEN, get-restaurants/logic.ts:7). New table, no legacy rows, so
-- it can be validated immediately rather than NOT VALID.
CREATE TABLE IF NOT EXISTS places_fetches (
  category     text NOT NULL,
  location     text NOT NULL CHECK (length(location) <= 80),
  result_count int NOT NULL CHECK (result_count >= 0),
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category, location)
);

-- RLS on with zero policies, and no GRANTs to any role — not even service_role.
-- Same lockdown as places_budget (023:65-70) and places_lookups (018:47-52). The
-- only things that touch this table are the two SECURITY DEFINER functions
-- below, which run as the owner and so are subject to neither. A client that
-- could write here could assert "this city has no restaurants" and blank a deck
-- for a week; a client that could read it learns which locations are cheap to
-- request and which still cost a lookup.
ALTER TABLE places_fetches ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Reading the marker
-- ---------------------------------------------------------------------------
-- Returns 'fresh' when a completed fetch for this location is inside the TTL,
-- 'miss' otherwise — no row, or a row that has expired.
--
-- A verdict string rather than a boolean, matching spend_places_lookup (023:101)
-- and for the same reason: the edge function renders the verdict through a pure
-- function (cacheVerdict in get-restaurants/logic.ts) that treats anything it
-- does not recognise as a miss, so a future verdict this deployment has never
-- heard of degrades to "go fetch" rather than to "serve whatever we have".
--
-- Note the direction of failure, which is the OPPOSITE of lookupRefusal's and
-- deliberately so. A budget RPC that raises has bounded no spend, so the only
-- safe answer is to refuse. A marker RPC that raises has vouched for no cache,
-- so the only safe answer is to fetch — which is precisely the pre-027
-- behaviour, still bounded by the budget that is still in front of it. This
-- migration can therefore be applied before or after the matching deploy.
CREATE OR REPLACE FUNCTION places_cache_verdict(p_category text, p_location text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ttl_hours  int;
  v_fetched_at timestamptz;
BEGIN
  IF p_category IS NULL OR p_location IS NULL THEN
    RAISE EXCEPTION 'category_and_location_required';
  END IF;

  SELECT cache_ttl_hours INTO v_ttl_hours FROM places_budget WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'places_budget_unconfigured';
  END IF;

  SELECT fetched_at INTO v_fetched_at
    FROM places_fetches
   WHERE category = p_category AND location = p_location;
  IF NOT FOUND THEN
    RETURN 'miss';
  END IF;

  IF v_fetched_at >= now() - make_interval(hours => v_ttl_hours) THEN
    RETURN 'fresh';
  END IF;

  RETURN 'miss';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Writing the marker
-- ---------------------------------------------------------------------------
-- Upsert, because re-recording a location is the normal case: the row is the
-- latest outcome, not a log.
--
-- This function does NOT decide whether the fetch was trustworthy — the caller
-- does, and must, because only it knows. get-restaurants calls this only when
-- the Places pagination completed without a failed page AND the resulting rows
-- were stored without error. A first-page failure throws before reaching here
-- and a later-page failure is now reported back rather than swallowed, so a
-- transient Places outage cannot be recorded as "this city has few
-- restaurants". That distinction is the whole safety property of this feature;
-- if a future caller is added, it owes the same discipline.
CREATE OR REPLACE FUNCTION record_places_fetch(p_category text, p_location text, p_count int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_category IS NULL OR p_location IS NULL OR p_count IS NULL THEN
    RAISE EXCEPTION 'category_location_and_count_required';
  END IF;

  INSERT INTO places_fetches (category, location, result_count, fetched_at)
    VALUES (p_category, p_location, p_count, now())
    ON CONFLICT (category, location)
    DO UPDATE SET result_count = excluded.result_count, fetched_at = now();
END;
$$;

-- service_role ONLY, same shape and same reasoning as 023:145-160. The REVOKEs
-- are not optional and anon/authenticated are named explicitly, not left to
-- PUBLIC: Supabase projects commonly carry `ALTER DEFAULT PRIVILEGES IN SCHEMA
-- public GRANT ALL ON FUNCTIONS TO anon, authenticated`, which attaches explicit
-- grants at CREATE time that a REVOKE FROM PUBLIC does not remove. Without these
-- lines any anonymous client could call record_places_fetch over PostgREST and
-- pin an arbitrary location as freshly-fetched — an empty deck for every room
-- that saved it, for a whole TTL, with no way for the app to notice. Verify
-- after applying:
--   SELECT proname, proacl FROM pg_proc
--    WHERE proname IN ('places_cache_verdict', 'record_places_fetch');
REVOKE ALL ON FUNCTION places_cache_verdict(text, text) FROM public;
REVOKE ALL ON FUNCTION places_cache_verdict(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION places_cache_verdict(text, text) TO service_role;

REVOKE ALL ON FUNCTION record_places_fetch(text, text, int) FROM public;
REVOKE ALL ON FUNCTION record_places_fetch(text, text, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION record_places_fetch(text, text, int) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Locations already stuck below the threshold are NOT backfilled
-- ---------------------------------------------------------------------------
-- "New York, NY" at 59 items is the known live instance, and it is tempting to
-- seed a marker for every (category, location) currently under 60 and be done.
-- That would be writing a claim this migration cannot support. A marker asserts
-- "a complete fetch happened and this is what it found"; for existing rows
-- nobody knows that. 023 collapsed duplicate items and DELETED the losers, so a
-- location sitting at 59 today may have been fetched to 60+ and then deduped
-- down — or may have been half-filled by exactly the truncated-pagination case
-- this migration now guards against. A blind backfill would freeze either of
-- those wrong answers in place for a full TTL, which is the failure mode point
-- 3 above exists to prevent.
--
-- They self-heal instead. The next request for such a location finds no marker,
-- spends one lookup, fetches, and records the truth; from then on it is cached.
-- The cost is one lookup per affected location, once, ever — against a budget of
-- 200 a day. That is the correct price for not guessing.

-- MANUAL: if you ever delete items rows for a location by hand (023:261-266
-- suggests exactly that for the over-long junk locations), delete its marker
-- too, or the location will serve the emptied remainder until the TTL expires:
--   DELETE FROM places_fetches WHERE location = '<the location>';
