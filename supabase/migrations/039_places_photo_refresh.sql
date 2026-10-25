-- 039_places_photo_refresh.sql
-- A per-city slot that lets get-restaurants re-fetch a cached location when its
-- stored Google photo links have lapsed.
--
-- WHY. get-restaurants stores each place's resolved Google `photoUri` in
-- items.image_url and serves a cached location indefinitely (cacheVerdict). The
-- links expire — the live deck showed 403s from googleusercontent.com and every
-- card fell back to its emoji — and nothing ever replaced them. The app now asks
-- for a refresh when a card's photo fails to load.
--
-- WHY PER CITY. A refresh is an upstream call past a full cache, so it is a way
-- to make a cached city cost money again. The per-user budget cannot bound that
-- on its own, so the slot is keyed on the location: it opens at most once every
-- 6 hours however many sessions ask, and the budget still applies on top. The
-- claim is one INSERT ... ON CONFLICT ... WHERE statement, so simultaneous
-- requests cannot all win it.
--
-- WHY places_fetches. It is already the per-location fetch marker (027), and a
-- refresh IS a fetch: winning the slot stamps fetched_at, and the function's own
-- record_places_fetch call stamps it again when the refetch completes. The
-- table has no grants, so this is SECURITY DEFINER like record_places_fetch.
--
-- ---------------------------------------------------------------------------
-- HOW THIS IS APPLIED
-- ---------------------------------------------------------------------------
-- By a human, by hand, in the Supabase SQL editor, before deploying the
-- get-restaurants version that calls it. 027 must already be applied. Until it
-- is, that function treats the missing RPC as a lost slot and serves the cache,
-- which is today's behaviour.

BEGIN;

CREATE OR REPLACE FUNCTION places_photo_refresh(p_category text, p_location text, p_count int)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_won boolean;
BEGIN
  IF p_category IS NULL OR p_location IS NULL OR p_count IS NULL THEN
    RAISE EXCEPTION 'category_location_and_count_required';
  END IF;

  INSERT INTO places_fetches (category, location, result_count, fetched_at)
    VALUES (p_category, p_location, p_count, now())
    ON CONFLICT (category, location)
    DO UPDATE SET result_count = excluded.result_count, fetched_at = now()
    WHERE places_fetches.fetched_at < now() - interval '6 hours'
    RETURNING true INTO v_won;

  RETURN coalesce(v_won, false);
END;
$$;

REVOKE ALL ON FUNCTION places_photo_refresh(text, text, int) FROM public;
REVOKE ALL ON FUNCTION places_photo_refresh(text, text, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION places_photo_refresh(text, text, int) TO service_role;

COMMIT;
