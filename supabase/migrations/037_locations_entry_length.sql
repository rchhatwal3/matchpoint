-- 037_locations_entry_length.sql
-- A single `rooms.locations` entry must be 80 characters or fewer.
--
-- WHAT WAS OPEN. 018:31-32 caps the ARRAY at 10 entries and 031 requires each
-- entry to name a region, but nothing bounded how long ONE entry may be. The
-- 2026-08-09 security pass saved a 5,004-character entry through a direct
-- PostgREST PATCH and it was accepted.
--
-- WHY IT IS ONLY P3, and what it still costs. It is not a money path:
-- get-restaurants rejects an over-80 location with a 400 (MAX_LOCATION_LEN,
-- get-restaurants/logic.ts:7) before the room guard, the budget spend and any
-- upstream call, so no oversized string ever reaches Places or `items`. What it
-- does buy an attacker is unbounded storage on a row they own, and a value the
-- app will render on the settings screen. 025 already closed the same hole on
-- items.location; this closes it on the column users can actually write.
--
-- WHERE THE CHECK GOES, and why not a CHECK constraint. A table CHECK cannot
-- contain a subquery, and scanning a text[] needs `unnest`, which is one. The
-- trigger is not a weaker placement here: `rooms_normalize_locations_trg` is
-- BEFORE INSERT OR UPDATE OF locations FOR EACH ROW (028), so it sees every
-- write to this column, and it is already where 031 refuses a regionless entry.
-- One function, one pass, one place to read.
--
-- 80 IS DUPLICATED, NOT DERIVED, exactly as 025 records: there is no way to
-- share a constant between Deno and Postgres. If MAX_LOCATION_LEN ever changes,
-- this function and 025's items_location_max_80 both have to change with it.
--
-- ---------------------------------------------------------------------------
-- HOW THIS IS APPLIED
-- ---------------------------------------------------------------------------
-- By a human, by hand, in the Supabase SQL editor. Nothing in CI applies
-- migrations. 028 and 031 must already be applied: this replaces the function
-- 028 created and 031 last rewrote, and calls the helpers both of them define.
--
-- RE-RUNNING 028 OR 031 AFTER THIS FILE REVERTS IT. Both carry a full
-- CREATE OR REPLACE of this same function. If all three are ever applied to a
-- fresh database, apply them in file order.

BEGIN;

-- Byte-for-byte 031's body (031:248-286) with one addition: the length pass
-- below the region pass. Everything else — the NULL early return, the
-- normalize_locations call, the TG_OP guard around OLD, SECURITY INVOKER with a
-- pinned search_path — is 031's and 028's reasoning, unchanged.
CREATE OR REPLACE FUNCTION rooms_normalize_locations()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  -- Entries already on the row are grandfathered. Empty on INSERT — OLD is not
  -- assigned for an INSERT trigger and reading OLD.locations there is an error,
  -- hence the TG_OP guard rather than a coalesce.
  grandfathered text[] := '{}'::text[];
  offending text[];
  toolong text[];
BEGIN
  IF NEW.locations IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.locations := normalize_locations(NEW.locations);

  IF TG_OP = 'UPDATE' THEN
    grandfathered := normalize_locations(coalesce(OLD.locations, '{}'::text[]));
  END IF;

  -- LENGTH RUNS FIRST, and the order is load-bearing. 031's message below
  -- interpolates the offending value, which is as long as the caller chose; an
  -- oversized entry that also lacks a region would put all 5,000 characters of
  -- it into an error string that reaches both the client and the Postgres log.
  -- Refusing on length first means the interpolating branch only ever sees a
  -- value already known to be within the cap.
  --
  -- Grandfathered like the region check below, and for the same reason: a room
  -- that already holds an oversized entry can still edit its OTHER locations,
  -- remove the offender, or change its price tiers. Refusing the whole row
  -- would leave such a room unable to fix itself from inside the app. Nothing
  -- can ADD one.
  SELECT array_agg(l ORDER BY ord) INTO toolong
    FROM unnest(NEW.locations) WITH ORDINALITY AS u(l, ord)
   WHERE length(l) > 80
     AND NOT (l = ANY (grandfathered));

  IF toolong IS NOT NULL THEN
    -- The length, not the value: see above.
    RAISE EXCEPTION 'A location may be at most 80 characters (got %)', length(toolong[1])
      USING ERRCODE = 'check_violation';
  END IF;

  -- Only entries this write is ADDING. An unchanged legacy `Portland` is in
  -- `grandfathered` and passes; the same string arriving on a room that did not
  -- already have it does not.
  SELECT array_agg(l ORDER BY ord) INTO offending
    FROM unnest(NEW.locations) WITH ORDINALITY AS u(l, ord)
   WHERE NOT has_location_region(l)
     AND NOT (l = ANY (grandfathered));

  IF offending IS NOT NULL THEN
    -- Says what to do, not just that it is refused — the client shows this text
    -- when it comes from a PATCH the app's own hint did not catch. Same wording
    -- as REGION_REQUIRED_HINT (lib/location.ts) and the edge function's 400.
    RAISE EXCEPTION 'Location "%" needs a state or country, e.g. Seattle, WA', offending[1]
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- PROBE — run these after applying
-- ---------------------------------------------------------------------------
-- As an ordinary member of a room you own, through PostgREST, not as the
-- dashboard's superuser — the trigger fires for both, but the point is what a
-- real caller gets back.
--
--   -- (a) 81 characters is refused (expect: ERROR, at most 80 characters)
--   UPDATE rooms SET locations = ARRAY[repeat('A', 77) || ', WA'] WHERE id = '<your room>';
--
--   -- (b) 80 characters is accepted
--   UPDATE rooms SET locations = ARRAY[repeat('A', 76) || ', WA'] WHERE id = '<your room>';
--
--   -- (c) nothing already stored is now unwritable
--   SELECT id, l FROM rooms, LATERAL unnest(locations) AS l WHERE length(l) > 80;
--
-- (c) returning rows is not a failure: those rooms keep their entries and can
-- still be updated. It is the list of rows to clean up by hand if you want the
-- column uniformly within the cap.
