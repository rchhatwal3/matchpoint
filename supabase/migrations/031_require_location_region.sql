-- 031_require_location_region.sql
-- A location must name a region: `Seattle, WA`, not `Seattle`.
--
-- Why this is a data rule and not a UI nicety. `Portland` is two cities —
-- Oregon and Maine — and Places answers a bare `Portland` by picking one. The
-- couple then swipes a deck of restaurants in a city they did not choose, and
-- because get-restaurants caches by exactly that string, the wrong city's rows
-- are what every later request for `Portland` serves. 028 made every spelling of
-- a place collapse to ONE bucket; this makes each bucket name ONE place.
--
-- This migration is the SERVER-SIDE half. The other halves are lib/location.ts
-- (hasRegion — the client write path, providers/SessionProvider.tsx), the
-- settings picker that makes the canonical form the easy path
-- (components/CityAutocomplete.tsx + lib/cities.ts), and
-- get-restaurants/logic.ts (hasRegion again, for the edge function). Section 2
-- below asserts this file's has_location_region against the SAME case table as
-- lib/location.test.ts and logic_test.ts and ABORTS if they diverge.
--
-- THE RULE, exactly: split on commas; there must be at least two parts and
-- EVERY part must contain a letter or digit.
--   pass: `Seattle, WA`  `Paris, France`  `Brooklyn, New York, NY`  `Seattle, 98101`
--   fail: `Seattle`  `Seattle,`  `, WA`  `Seattle, , WA`  `Seattle, .`
-- More than two parts is deliberately allowed — `Brooklyn, New York, NY` is more
-- specific than what is being demanded, not less valid, and refusing it would
-- reject the better answer. The trailing comma is the one shape this is strict
-- about, because `Seattle, WA,` would otherwise be a second cache bucket for
-- `Seattle, WA`, which is precisely what 028 exists to prevent.
--
-- SHAPE ONLY, no geocoding: `Seattle, Wakanda` passes. Anywhere Places and
-- Foursquare serve is a legitimate location, so the only thing checkable without
-- an upstream call is the shape — and the upstream call is the per-session
-- billing this feature exists to avoid.
--
-- ---------------------------------------------------------------------------
-- HOW THIS IS APPLIED
-- ---------------------------------------------------------------------------
-- By a human, by hand, in the Supabase SQL editor. Nothing in CI applies
-- migrations. 028 must already be applied — this file replaces the trigger
-- function 028 created and calls the normalize_locations 028 defines.
--
-- ---------------------------------------------------------------------------
-- DEPLOY ORDER: either order is safe; deploy get-restaurants first if you can.
-- ---------------------------------------------------------------------------
-- Unlike 028 there is no window where anything 403s or 400s that would not have
-- afterwards, because this file only ever REFUSES NEW regionless values and the
-- edge function's matching guard only refuses regionless REQUESTS. A stale web
-- bundle that tries to add `Seattle` gets the exception below instead of a
-- client-side hint — an uglier message, not a wrong outcome.
--
-- ---------------------------------------------------------------------------
-- EXISTING DATA IS GRANDFATHERED, ON PURPOSE. NOTHING HERE GUESSES A REGION.
-- ---------------------------------------------------------------------------
-- There are live rooms holding bare-city locations (`Seattle`, `Portland`,
-- `New Orleans` are real rows). A backfill would have to invent the missing
-- region, and `Portland` is exactly the case where inventing is unsafe: guessing
-- OR when the couple meant ME silently changes which city their deck shows, and
-- it is unrecoverable afterwards because the guess is indistinguishable from a
-- choice. `Seattle` looks obvious and `New Orleans` looks obvious; that they are
-- obvious to a reader is not a property the database can check.
--
-- So: section 3 REPORTS the affected rows and changes nothing. The owner decides
-- per row, in the app (removing the bare chip and adding the right city from the
-- picker is the whole fix) or by hand in SQL.
--
-- THE OWNER HAS SINCE DECIDED A SUBSET, in 032_backfill_bare_city_locations.sql.
-- That file carries an explicit `bare name -> canonical form` table — `Portland`
-- means Portland, Oregon, and so on for the metros listed there — and corrects
-- rooms.locations and items.location for exactly those names. It still does not
-- infer: a name is corrected because it is written down in that table, or not at
-- all. Nothing in THIS file changes; the grandfathering below remains the safety
-- net for every regionless value 032 has no row for, and 032's own report lists
-- what that leaves. Apply 032 after this file.
--
-- Section 4 enforces from then on,
-- and enforces only against entries that are NEW in a given write, so a room
-- holding a legacy `Portland` can still edit the rest of its list — see the note
-- there for why a CHECK constraint cannot do this.
--
-- Grandfathered rooms keep working: get-restaurants now 400s a regionless
-- location, and getRestaurantsForLocation (SessionProvider.tsx:42-60) catches
-- that and falls back to the `items` rows already stored for it. Those decks
-- serve from cache and simply stop spending Places lookups on an ambiguous
-- query, which is the desired behaviour until the row is fixed.

-- ---------------------------------------------------------------------------
-- 1. has_location_region(text) — the mirror of hasRegion
-- ---------------------------------------------------------------------------
-- string_to_array never returns an empty array, so the aggregate always has at
-- least one row: `''` -> {''} -> count 1 -> false, and `,` -> {'',''} ->
-- count 2 but bool_and false -> false.
--
-- [[:alnum:]] is the Postgres spelling of the `[\p{L}\p{N}]` the two TS mirrors
-- use, the same class 028 casts the casing rule in. Under this database's UTF-8
-- ctype it matches accented and non-latin letters, so `東京, 日本` and
-- `München, DE` pass — an assumption about the ctype, and section 2 checks it
-- before anything depends on it.
--
-- IMMUTABLE STRICT for the same reasons as normalize_location (028:95-103):
-- NULL in, NULL out, so a NULL array element is filtered out by the WHERE in
-- section 4 rather than being reported as regionless.
CREATE OR REPLACE FUNCTION has_location_region(raw text)
RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT count(*) >= 2 AND bool_and(part ~ '[[:alnum:]]')
    FROM unnest(string_to_array(raw, ',')) AS part;
$$;

-- ---------------------------------------------------------------------------
-- 2. Prove the three mirrors agree BEFORE anything depends on them
-- ---------------------------------------------------------------------------
-- Same discipline as 028 section 3, and not decoration: if this function
-- disagrees with hasRegion in lib/location.ts or get-restaurants/logic.ts, the
-- client offers a value the database then rejects (or worse, accepts one the
-- client refuses), and the rule quietly means two different things at two
-- different layers. The case table below is the SAME table as the hasRegion
-- blocks in lib/location.test.ts and logic_test.ts. On the first divergence this
-- RAISEs and the migration aborts with nothing installed but one unused function.
--
-- If it fires, do NOT loosen the check — fix the mirrors until they agree.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(format('%L -> %s (expected %s)', input,
                           has_location_region(input), expected), E'\n')
    INTO bad
    FROM (VALUES
      -- a city with a state or country
      ('Seattle, WA',            true),
      ('Paris, France',          true),
      ('Washington, DC',         true),
      -- a bare city
      ('Seattle',                false),
      ('New Orleans',            false),
      ('',                       false),
      -- a dangling comma on either side
      ('Seattle,',               false),
      ('Seattle, ',              false),
      (', WA',                   false),
      (',',                      false),
      -- a part that is only punctuation or whitespace
      ('Seattle, .',             false),
      ('Seattle, , WA',          false),
      -- more than two parts is allowed
      ('Brooklyn, New York, NY', true),
      ('Seattle, WA, USA',       true),
      -- shape only: the region is not checked against reality
      ('Seattle, Wakanda',       true),
      ('Springfield, ZZ',        true),
      -- the [[:alnum:]]-follows-Unicode assumption, stated as assertions
      ('東京, 日本',              true),
      ('München, DE',            true),
      -- a digit-only part still names somewhere
      ('Seattle, 98101',         true)
    ) AS t(input, expected)
   WHERE has_location_region(input) IS DISTINCT FROM expected;

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'has_location_region does not match the TS mirrors:\n%', bad;
  END IF;

  -- Region-ness is invariant under normalization — normalize_location touches
  -- only whitespace and case, never the comma structure. Section 4 leans on
  -- this: it normalizes first and checks second, and this says that ordering
  -- cannot change any answer.
  SELECT string_agg(format('%L flips to %s once normalized', input,
                           has_location_region(normalize_location(input))), E'\n')
    INTO bad
    FROM (VALUES
      ('seattle,wa'), ('  seattle ,  wa '), ('Seattle'), ('Seattle,'), (', wa'), ('paris,france')
    ) AS t(input)
   WHERE has_location_region(normalize_location(input))
         IS DISTINCT FROM has_location_region(input);

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'has_location_region is not normalization-invariant:\n%', bad;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. REPORT the rows that would fail the rule. CHANGES NOTHING.
-- ---------------------------------------------------------------------------
-- This is the deliberate half of "grandfather what exists". Every regionless
-- location currently stored is listed by room, with its invite code, so the
-- owner can go fix them one at a time knowing which pair each belongs to.
--
-- 032 later corrects the names the owner decided on and re-runs this report
-- against the corrected data, so on a database that has both applied it is 032's
-- notices, not these, that name what is actually left to fix.
--
-- In the Supabase SQL editor these arrive under Messages/Notices, not in the
-- results grid. If that panel is easy to miss, run the SELECT in section 5(c)
-- instead — it is the same question as a normal query.
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT id, code, array_agg(l ORDER BY ord) AS regionless
      FROM rooms, LATERAL unnest(locations) WITH ORDINALITY AS u(l, ord)
     WHERE NOT has_location_region(l)
     GROUP BY id, code
     ORDER BY id
  LOOP
    n := n + 1;
    RAISE NOTICE 'room % (code %) holds regionless location(s): %', r.id, r.code, r.regionless;
  END LOOP;

  IF n = 0 THEN
    RAISE NOTICE 'No room holds a regionless location. Nothing to fix by hand.';
  ELSE
    RAISE NOTICE '% room(s) above are GRANDFATHERED — this migration does not touch them.', n;
    RAISE NOTICE 'Fix each one deliberately: `Portland` is Oregon OR Maine and guessing is not recoverable.';
    RAISE NOTICE 'Easiest fix is in the app: remove the bare chip, add the right city from the picker.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Enforce on new entries — extend 028's trigger, do not add a CHECK
-- ---------------------------------------------------------------------------
-- WHY NOT A CHECK CONSTRAINT. A CHECK is evaluated against the whole new row on
-- every INSERT and UPDATE of that row, and it cannot see the old one. So a
-- CHECK would either have to be VALID — impossible, the legacy rows violate it —
-- or NOT VALID, which skips rows at rest but still fires on any UPDATE that
-- touches them. A room holding a legacy `Portland` could then never be edited
-- again: not its price tiers, not its other locations, not even to REMOVE the
-- offending entry, because the constraint re-checks the whole array. That is the
-- opposite of grandfathering. Only a trigger can compare NEW against OLD and
-- refuse just what a write is ADDING.
--
-- WHY EXTEND 028's FUNCTION RATHER THAN ADD A SECOND TRIGGER. The check must run
-- AFTER normalization (a whitespace-only entry has to be dropped by
-- normalize_locations, not rejected as regionless), and triggers on the same
-- table and event fire in alphabetical order by trigger name. Relying on
-- `rooms_normalize_locations_trg` sorting before a hypothetical
-- `rooms_require_region_trg` would make behaviour depend on a name — one rename
-- away from silently reordering. One function, one pass, no ordering to get
-- wrong. The trigger definition from 028 is unchanged and still points here.
--
-- SECURITY INVOKER (the default) and a pinned search_path, both for 028's
-- reasons (028:320-325): it needs no privilege its caller lacks, and the
-- unqualified calls must resolve to the functions above, not to something a
-- caller planted earlier on their own search_path.
CREATE OR REPLACE FUNCTION rooms_normalize_locations()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  -- Entries already on the row are grandfathered. Empty on INSERT — OLD is not
  -- assigned for an INSERT trigger and reading OLD.locations there is an error,
  -- hence the TG_OP guard rather than a coalesce.
  grandfathered text[] := '{}'::text[];
  offending text[];
BEGIN
  IF NEW.locations IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.locations := normalize_locations(NEW.locations);

  IF TG_OP = 'UPDATE' THEN
    grandfathered := normalize_locations(coalesce(OLD.locations, '{}'::text[]));
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

-- The trigger itself is 028's and is deliberately NOT recreated here: it is
-- already BEFORE INSERT OR UPDATE OF locations ON rooms FOR EACH ROW EXECUTE
-- FUNCTION rooms_normalize_locations(), which is exactly what this needs.
-- Re-running 028 after this file would revert the function body — if both are
-- ever applied to a fresh database, apply them in order.

-- ---------------------------------------------------------------------------
-- 5. PROBE — run these after applying
-- ---------------------------------------------------------------------------
-- Section 2 already proved the function matches the TS mirrors, or this file
-- would not have applied. These check the trigger actually fires and show what
-- is left to fix by hand.
--
--   -- (a) a regionless ADD is refused (expect: ERROR, ... needs a state or country)
--   UPDATE rooms SET locations = locations || 'Springfield'
--    WHERE id = '<some room id>';
--
--   -- (b) a room with a legacy bare city can still be edited — this must SUCCEED
--   --     for a room listed in section 3, proving grandfathering works:
--   UPDATE rooms SET locations = locations WHERE id = '<a room from section 3>';
--
--   -- (c) what is still un-regioned, as a query rather than a NOTICE
--   SELECT id, code, l AS regionless_location
--     FROM rooms, LATERAL unnest(locations) AS l
--    WHERE NOT has_location_region(l)
--    ORDER BY id;
--
--   -- (d) the same question for the cached catalogue. NOT enforced and not
--   --     cleaned up BY THIS FILE: these rows are real restaurants that real
--   --     members have already swiped, and deleting them would cascade into
--   --     swipes and matches (001:36, 021:38). 032 handles the names the owner
--   --     decided on — repointing the rows something references and deleting
--   --     only the ones nothing does — so after it, what this returns is the
--   --     rows for names 032 has no mapping for. Those stay until the room that
--   --     sourced them is fixed and the deck refills under the correct location.
--   SELECT location, count(*) AS items
--     FROM items
--    WHERE location IS NOT NULL AND NOT has_location_region(location)
--    GROUP BY location ORDER BY items DESC;
