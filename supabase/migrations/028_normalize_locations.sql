-- 028_normalize_locations.sql
-- Location strings are free text and nothing canonicalizes them, so every
-- spelling of a city is its own paid Places cache bucket. get-restaurants keys
-- its cache on `.eq('location', loc)` exactly, so `Seattle` (20 items),
-- `Seattle, WA` (60) and `seattle,wa` are three unrelated buckets: three
-- upstream lookups, three parallel sets of `items` rows, three markers in
-- places_fetches, and a deck that is 20 cards for one partner and 60 for the
-- other depending on which spelling their room happens to hold. 023's global
-- ceiling bounds the resulting bill; it does nothing about the waste.
--
-- This migration is the SERVER-SIDE half of the fix. The other two halves are
-- lib/location.ts (client write path) and get-restaurants/logic.ts (edge
-- function). normalize_location(text) below must behave identically to
-- normalizeLocation in both of those; the DO block in section 3 asserts exactly
-- that, against the same case table as lib/location.test.ts and logic_test.ts,
-- and ABORTS this migration if the three ever diverge.
--
-- DETERMINISTIC ONLY, deliberately. This does not geocode, does not require a
-- region, and does NOT resolve `Seattle` to `Seattle, WA`. Those merge two
-- places a user may have meant differently — a product decision, shipping
-- separately as a UI feature with autocomplete, not a formatting one.
--
-- ---------------------------------------------------------------------------
-- HOW THIS IS APPLIED
-- ---------------------------------------------------------------------------
-- By a human, by hand, in the Supabase SQL editor. Nothing in CI applies
-- migrations — .github/workflows/deploy.yml runs tests and publishes the web
-- bundle and never touches the database. If this file is not pasted and run,
-- none of it exists, however green the build is.
--
-- ---------------------------------------------------------------------------
-- DEPLOY ORDER: DEPLOY get-restaurants FIRST, THEN APPLY THIS FILE.
-- ---------------------------------------------------------------------------
-- Note that this is the OPPOSITE of 023's mandate (023:268 — migrate first).
-- The reasoning is worth writing down because 013 got the analogous call wrong
-- and broke live create/join (HANDOFF.md:109).
--
-- Both orders converge on the same correct steady state, because the new
-- isLocationAllowed normalizes BOTH sides of the comparison — the caller's
-- requested location and each entry of rooms.locations — and normalization is
-- idempotent. A room row that is already canonical and a room row that is still
-- raw therefore both match a normalized request. The orders differ only in what
-- happens during the window, and they are not equally cheap:
--
--   NEW FUNCTION FIRST, then this file (RECOMMENDED).
--   Room rows are still raw, e.g. `seattle,wa`. The caller sends `seattle,wa`;
--   the function normalizes it to `Seattle, WA` and normalizes the room's
--   `seattle,wa` to the same thing, so the allowlist passes. The cache read
--   `.eq('location', 'Seattle, WA')` then misses the rows still stored under
--   `seattle,wa`, so that location pays ONE extra lookup and re-inserts under
--   the canonical spelling. Section 5 below merges the two buckets afterwards.
--   Worst case: one redundant Places lookup per location in flight, bounded by
--   023's per-user and global budgets. Nothing 403s, nothing is lost.
--
--   THIS FILE FIRST, then the new function.
--   Steady state is fine — the OLD function's `location.trim()` is a no-op on an
--   already-canonical string and its trim+lowercase allowlist compare still
--   matches, because both sides come from the same normalized room row. But
--   there is a live failure window: a user on a web bundle that predates the
--   client fix edits their locations, the old client optimistically holds the
--   raw `seattle,wa` it just typed, the section-4 trigger rewrites the stored
--   row to `Seattle, WA`, and the old function compares `seattle,wa` against
--   `Seattle, WA` and returns 403 "Location not in your room". It self-heals
--   when the realtime rooms UPDATE (006 puts rooms in the publication;
--   SessionProvider.tsx:217-235 applies it) pushes the canonical value back —
--   but the user has already seen an empty deck.
--
-- One order costs a redundant API call; the other costs a visible 403. Deploy
-- the function first.
--
-- ---------------------------------------------------------------------------
-- WHAT COULD STILL GO WRONG, AND WHY IT CANNOT GO WRONG HALFWAY
-- ---------------------------------------------------------------------------
-- Section 5 is wrapped in an explicit BEGIN/COMMIT for the same reason 023's
-- was (023:183-190): `swipes.item_id` and `matches.item_id` are ON DELETE
-- CASCADE (001:36, 021:38), so a DELETE of duplicate items that runs after a
-- failed repoint destroys real user swipes and matches, permanently and
-- silently. Applying this file statement-by-statement — any tool that
-- autocommits per statement — is exactly that scenario. Run section 5 as one
-- transaction. Sections 1-4 are pure DDL and are safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. normalize_location(text) — the canonical form of one location string
-- ---------------------------------------------------------------------------
-- The mirror of normalizeLocation in lib/location.ts and
-- get-restaurants/logic.ts. Idempotent: normalize_location(normalize_location(x))
-- = normalize_location(x). Steps, in this order:
--   1. collapse every run of whitespace to a single space
--   2. normalize comma spacing to ', '
--   3. trim (AFTER step 2, which leaves a trailing space on a string ending in
--      a comma — that ordering is what makes the whole thing idempotent)
--   4. case each letter/digit RUN, PER COMMA PART:
--        a. a small word (de, del, la, of, the, van, ...) that is NOT the run
--           opening its part -> lowercase, so `Rio de Janeiro`, `Isle of Man`
--        b. otherwise a run of 1-2 characters in any part but the FIRST ->
--           uppercase whole, so state and country codes survive as WA / NY / UK
--        c. otherwise `Mc` + two or more letters -> Mc + capital + rest lower,
--           so `mckinney` -> `McKinney`
--        d. otherwise Title Case
--
-- WHY 4b IS SCOPED TO A PART. The whole-uppercase rule exists for exactly one
-- reason: region codes. Applied to every part it mangled the CITY, which is the
-- half a user reads back in Settings — `EL Paso`, `Santa FE`, `HO Chi Minh
-- City`, `ST. Petersburg`. The first part is excluded rather than "every part
-- but the last" because in `city, region, country` the code is the MIDDLE part:
-- `seattle, wa, usa` must still give `Seattle, WA, Usa`. 4a is checked before
-- 4b so a middle part like `Île de France` does not come out `Île DE France`; a
-- real region code opens its part, so it never reaches the small-word list.
--
-- `Mac` is deliberately NOT part of 4c. `Macon` and `Madison` fit the same shape
-- as `MacArthur`, and no string-shape test separates them — only a name list
-- would, which is semantics, and this function is shape only.
--
-- STRICT is load-bearing: normalize_location(NULL) must be NULL, not ''. The
-- location-independent catalogue rows (food, vacations, shows — 001:26-29) carry
-- location IS NULL and section 5's backfill must leave them exactly as they are.
--
-- IMMUTABLE, so this can be used in an index or a generated column later. It is
-- strictly speaking ctype-dependent (see the [[:alnum:]] note below), the same
-- way upper() and lower() are and are also marked IMMUTABLE. Changing the
-- database's ctype would invalidate any index built on it — as it would for
-- upper() — which is not a scenario this project has.
--
-- WHY THE TOKEN LOOP RATHER THAN regexp_replace. The rule is per-match ("this
-- run is 2 characters and sits after a comma, uppercase it whole; that one is
-- 7, title-case it") and regexp_replace's replacement is a template string, not
-- a callback — there is no way to branch on the matched text. So the string is
-- split on commas into parts, each part is split into its alternating
-- alnum-runs and separator-runs, each token is transformed from its own text
-- plus its position (which part, which run within the part), and the pieces are
-- concatenated back in order. That is what makes this per-RUN and not per-word,
-- which is the whole reason `seattle, wa, 98101` comes out as `Seattle, WA,
-- 98101`: the comma is not part of the run, so `wa` is two characters whether
-- or not one follows it. initcap() is deliberately not used — it has no length
-- rule, no position rule and no small-word rule, and would give `Seattle, Wa`
-- and `Rio De Janeiro`.
--
-- [[:alnum:]] is the Postgres spelling of the JS `[\p{L}\p{N}]` the other two
-- mirrors use. Under this database's UTF-8 ctype it matches accented and
-- non-latin letters, so `são paulo, br` -> `São Paulo, BR` and `東京` survives
-- unchanged. That is an assumption about the ctype, not a guarantee — and it is
-- exactly what section 3 checks before any data is touched.
--
-- The whitespace class is [[:space:]] plus U+00A0 (non-breaking space) and
-- U+FEFF (BOM/zero-width no-break space), which glibc's ctype does NOT report as
-- space but JS's \s does. They are the two that realistically arrive by paste
-- from a web page. The residual difference is the rest of JS's \s
-- (U+1680, U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000), and it is
-- harmless in the direction that matters: a value written through either TS
-- mirror has already had those collapsed to a plain space, so this function is
-- still a fixed point on client output — which is all the trigger in section 4
-- needs. A raw PATCH carrying an ideographic space would come out slightly less
-- normalized here, never wrongly normalized.
CREATE OR REPLACE FUNCTION normalize_location(raw text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  WITH collapsed AS (
    SELECT btrim(
             regexp_replace(
               regexp_replace(raw, '[[:space:] ﻿]+', ' ', 'g'),
               ' *, *', ', ', 'g'),
             ' ') AS v
  ),
  -- One row per comma part, in order. The commas themselves are in no part;
  -- they come back as the final string_agg's ',' delimiter, so an empty part
  -- (`Seattle,` splits to {'Seattle',''}) still holds its place and the round
  -- trip stays lossless. An empty `v` splits to ZERO rows, which is what makes
  -- normalize_location('') = '' fall out of the coalesce at the bottom.
  part AS (
    SELECT p AS ptext, pord
      FROM collapsed,
           LATERAL unnest(string_to_array(collapsed.v, ',')) WITH ORDINALITY AS x(p, pord)
  ),
  -- Every character of a part lands in exactly one token: at any position
  -- either the alnum branch or the non-alnum branch matches, never both, so the
  -- concatenation below is lossless. `run_idx` counts the alnum runs seen so far
  -- within the part, so run_idx = 1 is the run that OPENS its part — the test
  -- the small-word rule needs, and the reason `Las Vegas` and `The Dalles` keep
  -- their capital while `Rio de Janeiro` does not.
  tok AS (
    SELECT part.pord,
           x.ord,
           x.m[1] AS t,
           x.m[1] ~ '^[[:alnum:]]' AS is_run,
           count(*) FILTER (WHERE x.m[1] ~ '^[[:alnum:]]')
             OVER (PARTITION BY part.pord ORDER BY x.ord) AS run_idx
      FROM part,
           LATERAL regexp_matches(part.ptext, '[[:alnum:]]+|[^[:alnum:]]+', 'g')
             WITH ORDINALITY AS x(m, ord)
  ),
  -- The four casing branches, in the same order the TS mirrors apply them.
  cased AS (
    SELECT pord,
           string_agg(
             CASE
               WHEN NOT is_run THEN t
               WHEN run_idx > 1 AND lower(t) IN (
                      'de', 'del', 'la', 'las', 'los', 'da', 'do', 'dos', 'di', 'du',
                      'le', 'les', 'van', 'von', 'der', 'den', 'of', 'the', 'and', 'upon')
                 THEN lower(t)
               WHEN pord > 1 AND length(t) <= 2 THEN upper(t)
               WHEN t ~* '^mc[[:alpha:]]{2,}$'
                 THEN 'Mc' || upper(substr(t, 3, 1)) || lower(substr(t, 4))
               ELSE upper(substr(t, 1, 1)) || lower(substr(t, 2))
             END,
             '' ORDER BY ord) AS ptext
      FROM tok
     GROUP BY pord
  )
  -- LEFT JOIN, not JOIN: a part with no tokens at all — the empty part on
  -- either side of a bare comma — has no row in `cased` and must still
  -- contribute its empty string, and with it its comma.
  SELECT coalesce(string_agg(coalesce(c.ptext, p.ptext), ',' ORDER BY p.pord), '')
    FROM part p
    LEFT JOIN cased c USING (pord);
$$;

-- ---------------------------------------------------------------------------
-- 2. normalize_locations(text[]) — the canonical form of a room's whole list
-- ---------------------------------------------------------------------------
-- Mirror of normalizeLocations in lib/location.ts: normalize each entry, drop
-- the ones that normalize to nothing, dedupe, keep the first occurrence and the
-- user's ordering.
--
-- The dedupe is exact equality, not case-insensitive, because normalize_location
-- has already fixed the case — two entries that differed only in case are now
-- literally equal. DISTINCT ON keeps the lowest `ord` per canonical value (that
-- is what its ORDER BY does), and the outer array_agg re-sorts by `ord` to put
-- the surviving entries back in the order the user chose.
--
-- A NULL element is dropped rather than propagated: normalize_location(NULL) is
-- NULL (STRICT), and `NULL <> ''` is NULL, which the WHERE filters out. A raw
-- PostgREST PATCH is the only thing that can put a NULL in this array, and
-- rooms.locations is a NOT NULL text[] whose elements the app always fills.
CREATE OR REPLACE FUNCTION normalize_locations(raw text[])
RETURNS text[]
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT coalesce(array_agg(loc ORDER BY ord), '{}'::text[])
    FROM (
      SELECT DISTINCT ON (normalize_location(l))
             normalize_location(l) AS loc,
             ord
        FROM unnest(raw) WITH ORDINALITY AS u(l, ord)
       WHERE normalize_location(l) <> ''
       ORDER BY normalize_location(l), ord
    ) d;
$$;

-- ---------------------------------------------------------------------------
-- 3. Prove the three mirrors agree BEFORE touching any data
-- ---------------------------------------------------------------------------
-- This is not decoration. Two things in section 1 are assumptions about this
-- particular server that cannot be verified from a laptop: that [[:alnum:]]
-- follows Unicode under the database's ctype, and that the \uwxyz escapes are
-- understood by the regex engine. If either is wrong, normalize_location
-- silently produces a different canonical form from the two TS mirrors, the
-- trigger in section 4 fights the client on every write, and the cache splits
-- along a seam nobody is watching.
--
-- So: the case table below is the SAME table as lib/location.test.ts and
-- get-restaurants/logic_test.ts, and this block RAISES — aborting the migration
-- with nothing modified — on the first divergence. Sections 1-2 are CREATE OR
-- REPLACE and section 4 has not run yet, so an abort here leaves the database
-- exactly as it was apart from two unused functions.
--
-- If this fires, do NOT "fix" it by loosening the check. Fix normalize_location
-- until it matches, or fix all three mirrors together — they are one behaviour
-- with three implementations, and this block is the only thing that says so.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(format('%L -> %L (expected %L)', input, normalize_location(input), expected),
                    E'\n')
    INTO bad
    FROM (VALUES
      -- whitespace
      ('  Seattle  ',        'Seattle'),
      (E'\t\nSeattle\n\t',   'Seattle'),
      ('New    York',        'New York'),
      (E'New\t\nYork',       'New York'),
      -- comma spacing
      ('Seattle,WA',         'Seattle, WA'),
      ('Seattle , WA',       'Seattle, WA'),
      ('Seattle ,WA',        'Seattle, WA'),
      ('Seattle,   WA',      'Seattle, WA'),
      -- trim runs after the comma rule, so no trailing space survives
      ('Seattle,',           'Seattle,'),
      ('Seattle, ',          'Seattle,'),
      -- casing, including the 1-2 character whole-uppercase rule
      ('seattle, wa',        'Seattle, WA'),
      ('new york, ny',       'New York, NY'),
      ('SEATTLE, WA',        'Seattle, WA'),
      ('sEaTtLe',            'Seattle'),
      -- per-RUN, not per-word: a trailing comma is not part of the run
      ('seattle, wa, 98101', 'Seattle, WA, 98101'),
      ('d.c.',               'D.C.'),
      -- documented consequence of the length rule: `usa` is three characters.
      -- Also the reason 4b excludes the FIRST part rather than every part but
      -- the last: here the region code is the middle one.
      ('seattle, wa, usa',   'Seattle, WA, Usa'),
      -- 4b, the part rule. Short runs in the first part are Title Case; short
      -- runs after the first comma are codes and uppercase whole.
      ('el paso, tx',              'El Paso, TX'),
      ('santa fe, nm',             'Santa Fe, NM'),
      ('ho chi minh city, vietnam','Ho Chi Minh City, Vietnam'),
      ('st. petersburg, fl',       'St. Petersburg, FL'),
      ('las vegas, nv',            'Las Vegas, NV'),
      ('washington, dc',           'Washington, DC'),
      ('new  york , ny',           'New York, NY'),
      -- 4c, Mc. `~*` and [[:alpha:]] are the SQL spelling of the TS
      -- /^mc\p{L}{2,}$/iu, and this is where a ctype that does not follow
      -- Unicode would show up as a divergence.
      ('mckinney, tx',       'McKinney, TX'),
      ('mcallen, tx',        'McAllen, TX'),
      ('MCKINNEY',           'McKinney'),
      -- ... and the Mac words 4c must NOT touch
      ('macon, ga',          'Macon, GA'),
      ('madison, wi',        'Madison, WI'),
      -- 4a, small words: lowercase only when something precedes them in their
      -- part, so the leading capital survives in `The Dalles` and `De Pere`
      ('rio de janeiro, brazil',   'Rio de Janeiro, Brazil'),
      ('isle of man',              'Isle of Man'),
      ('newcastle upon tyne, uk',  'Newcastle upon Tyne, UK'),
      ('the dalles, or',           'The Dalles, OR'),
      ('de pere, wi',              'De Pere, WI'),
      ('los angeles, ca',          'Los Angeles, CA'),
      -- 4b beats 4a in a later part, because a code opens its part and so is
      -- never a candidate for the small-word rule: this `de` is Germany
      ('münchen, de',        'München, DE'),
      -- no comma at all: the whole string is the first part
      ('el paso',            'El Paso'),
      ('são paulo',          'São Paulo'),
      ('mckinney',           'McKinney'),
      -- commas with nothing between them: every part keeps its place, so the
      -- string_agg round trip is lossless
      (',',                  ','),
      (',,,',                ', , ,'),
      ('  ,  ,  ',           ', ,'),
      -- already canonical, asserted as the fixed points they are
      ('Seattle, WA',            'Seattle, WA'),
      ('El Paso, TX',            'El Paso, TX'),
      ('McKinney, TX',           'McKinney, TX'),
      ('Rio de Janeiro, Brazil', 'Rio de Janeiro, Brazil'),
      ('St. Petersburg, FL',     'St. Petersburg, FL'),
      ('São Paulo, Brazil',      'São Paulo, Brazil'),
      -- punctuation other than commas is passed through untouched
      ('coeur d''alene, id', 'Coeur D''Alene, ID'),
      ('winston-salem, nc',  'Winston-Salem, NC'),
      -- digits
      ('paris 11e',          'Paris 11e'),
      ('area 51',            'Area 51'),
      -- the [[:alnum:]]-follows-Unicode assumption, stated as assertions
      ('são paulo, br',      'São Paulo, BR'),
      ('são paulo, brazil',  'São Paulo, Brazil'),
      ('ZÜRICH',             'Zürich'),
      ('münchen,de',         'München, DE'),
      ('東京',               '東京'),
      -- empty input
      ('',                   ''),
      ('   ',                ''),
      (E'\t\n ',             ''),
      -- the U+00A0 / U+FEFF additions to the whitespace class
      (E'New York',     'New York'),
      (E'﻿Seattle',     'Seattle')
    ) AS t(input, expected)
   WHERE normalize_location(input) IS DISTINCT FROM expected;

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'normalize_location does not match the TS mirrors:\n%', bad;
  END IF;

  -- Idempotence, checked separately because it is the property the section-4
  -- trigger relies on to not churn rows the client already normalized.
  SELECT string_agg(format('%L is not a fixed point', normalize_location(input)), E'\n')
    INTO bad
    FROM (VALUES
      ('  seattle ,  wa '), ('Seattle, WA'), ('new york,ny'), ('são paulo, br'),
      ('Seattle,'), (''), ('   '), ('coeur d''alene, id'), ('seattle, wa, usa'),
      -- and the per-part rules, each of which is a new chance to not be a
      -- fixed point: a second pass re-splits on the same commas, re-finds the
      -- same runs, and every branch below is decided on lower(t), so an
      -- already-cased run takes the branch it took the first time
      ('el paso, tx'), ('mckinney, tx'), ('santa fe, nm'),
      ('ho chi minh city, vietnam'), ('rio de janeiro, brazil'),
      ('st. petersburg, fl'), ('las vegas, nv'), ('washington, dc'),
      ('new  york , ny'), ('the dalles, or'), ('de pere, wi'), ('isle of man'),
      ('macon, ga'), ('el paso'), (','), (',,,'), ('  ,  ,  '),
      ('McKinney, TX'), ('Rio de Janeiro, Brazil'), ('São Paulo, Brazil')
    ) AS t(input)
   WHERE normalize_location(normalize_location(input))
         IS DISTINCT FROM normalize_location(input);

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'normalize_location is not idempotent:\n%', bad;
  END IF;

  -- And the array wrapper: normalize, drop empties, dedupe, keep first, keep order.
  IF normalize_locations(ARRAY['Seattle, WA', 'seattle,wa', 'SEATTLE , WA'])
     IS DISTINCT FROM ARRAY['Seattle, WA'] THEN
    RAISE EXCEPTION 'normalize_locations does not dedupe canonical duplicates';
  END IF;
  IF normalize_locations(ARRAY['portland', '', '  ', 'seattle', 'PORTLAND'])
     IS DISTINCT FROM ARRAY['Portland', 'Seattle'] THEN
    RAISE EXCEPTION 'normalize_locations does not preserve first-occurrence order';
  END IF;
  IF normalize_locations('{}'::text[]) IS DISTINCT FROM '{}'::text[] THEN
    RAISE EXCEPTION 'normalize_locations does not round-trip the empty array';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. The trigger: rooms.locations is normalized server-side, always
-- ---------------------------------------------------------------------------
-- This is load-bearing, not belt-and-braces. 022:32 grants `authenticated` a
-- column-scoped UPDATE on rooms(locations, price_tiers), which is exactly the
-- grant PostgREST exposes: any member can PATCH /rest/v1/rooms?id=eq.<their
-- room> with {"locations":["seattle,wa","SEATTLE","Seattle , WA"]} and never
-- execute a line of the client bundle. Without this trigger, lib/location.ts is
-- a suggestion. With it, the canonical form is a property of the column.
--
-- It also closes the older hole the same way: rooms created before this
-- migration, rooms edited by a stale cached web bundle, and any future writer
-- (a script, a second app, a support fix in the SQL editor) all land normalized
-- without knowing this rule exists.
--
-- SECURITY INVOKER (the default), NOT DEFINER: this function needs no privilege
-- its caller lacks — it only rewrites the row the caller is already permitted to
-- write, and RLS on rooms (002:20-21) decides that before the trigger ever
-- fires. search_path is pinned anyway, per the project rule, because the
-- unqualified normalize_locations call must resolve to the one above and not to
-- something a caller planted in a schema earlier on their own search_path.
CREATE OR REPLACE FUNCTION rooms_normalize_locations()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.locations IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.locations := normalize_locations(NEW.locations);
  RETURN NEW;
END;
$$;

-- `UPDATE OF locations` rather than a bare UPDATE: the trigger fires only when
-- that column appears in the SET list, so price_tiers edits (the other half of
-- 022's grant) and any future column pay nothing. INSERT has no such clause and
-- needs none — create_room (003, re-signed by 013/019) inserts the '{}' default.
--
-- BEFORE, so the rewritten value is what gets stored and what
-- rooms_locations_max_10 (018:30-32) is checked against. Deduping can only
-- shrink the array, so a list that passed that CHECK before still passes.
DROP TRIGGER IF EXISTS rooms_normalize_locations_trg ON rooms;
CREATE TRIGGER rooms_normalize_locations_trg
  BEFORE INSERT OR UPDATE OF locations ON rooms
  FOR EACH ROW EXECUTE FUNCTION rooms_normalize_locations();

-- ---------------------------------------------------------------------------
-- 5. Backfill — ONE TRANSACTION, see the header
-- ---------------------------------------------------------------------------
BEGIN;

-- Blocks concurrent writers to `items` for the rest of the transaction, for the
-- same reason as 023:199: the duplicate map below is a snapshot, and a live
-- get-restaurants request that commits a new row after it is taken would be
-- absent from the map, survive the DELETE, and then collide on
-- items_category_title_location_key (023:255-257) when the UPDATE normalizes it.
--
-- `rooms` deliberately gets NO lock. Section 4's trigger is already in place by
-- the time this runs, so every concurrent write to rooms.locations is already
-- normalized; the backfill below cannot race it into an un-normalized state.
LOCK TABLE items IN EXCLUSIVE MODE;

-- 5a. The ~1,000-character runs of 'A'.
--
-- Residue of an old probe that predates the 80-char cap: 20-ish rows whose
-- `location` is a single enormous run of 'A', written by the concurrent-insert
-- path 023 fixed. 023 deduped them (it had to — they would have blocked its
-- UNIQUE constraint) but deliberately left the deletion to a human (023:261-266);
-- 025 then added CHECK (length(location) <= 80) as NOT VALID, so they survive
-- as legacy rows.
--
-- They have to go FIRST, and not as tidying. A NOT VALID CHECK is not enforced
-- against rows at rest, but it IS enforced on every INSERT and UPDATE — so the
-- moment 5c's UPDATE touches one of these rows, items_location_max_80 rejects it
-- and the whole transaction aborts. Deleting them is what makes 5c possible.
--
-- Matched on `length(location) > 80` rather than on the 'A' pattern: that is
-- precisely the set of rows the constraint will reject, it is self-documenting
-- against 025, and it cannot miss a differently-shaped junk row from the same
-- era. It cascades into swipes and matches (001:36, 021:38) — correct here,
-- because a swipe on a 1,000-character-location card is itself junk.
DELETE FROM items WHERE length(location) > 80;

-- 5b. Refuse to start if normalizing would push a real row past the cap.
--
-- Comma spacing can LENGTHEN a string, by one character per comma
-- (`Seattle,WA` -> `Seattle, WA`), so a legitimate 79-character location with
-- three commas normalizes to 82 and 5c would abort on items_location_max_80.
-- The transaction would roll back cleanly, but with a bare constraint violation
-- that says nothing about which rows or why. This says it, before any work:
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(format('%L (%s -> %s chars)',
                           location, length(location), length(normalize_location(location))),
                    E'\n')
    INTO bad
    FROM (SELECT DISTINCT location FROM items
           WHERE location IS NOT NULL
             AND length(normalize_location(location)) > 80) d;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'These locations normalize past the 80-char cap (025). Shorten or delete them by hand, then re-run:\n%', bad;
  END IF;
END;
$$;

-- 5c. Collapse the rows that normalization is about to collide.
--
-- `Seattle` (20 rows) and `Seattle, WA` (60 rows) become one bucket, and any
-- restaurant present in both now violates UNIQUE (category, title, location)
-- from 023. So the losers are merged away BEFORE the UPDATE, not after — after
-- is not an option, the UPDATE would simply fail.
--
-- Scoped to `location IS NOT NULL`: the constraint uses PostgreSQL's default
-- NULLS DISTINCT, so the location-independent catalogue rows never conflict with
-- each other and must not be touched. Same scope as 023's constraint.
DROP TABLE IF EXISTS items_locnorm_dupe_map;

-- Keeper preference copied from 023:206-216, and for the same reason:
-- duplicates are NOT interchangeable. resolvePhotoUrl returns null on any photo
-- failure and price_level stays null until Foursquare fills it, so choosing
-- blind by uuid can keep the impoverished copy and delete the enriched one —
-- irreversible once the DELETE below runs. Prefer a row with an image and a
-- price, then fall back to id so the result is deterministic.
--
-- A real table, not TEMP, and dropped first: an apply that aborted partway
-- leaves it behind, and every retry would then fail here rather than at the
-- statement that actually broke.
CREATE TABLE items_locnorm_dupe_map AS
  SELECT id AS dupe_id,
         first_value(id) OVER (
           PARTITION BY category, title, normalize_location(location)
           ORDER BY (image_url IS NULL), (price_level IS NULL), id
         ) AS keep_id
    FROM items
   WHERE location IS NOT NULL;

DELETE FROM items_locnorm_dupe_map WHERE dupe_id = keep_id;

-- Repoint swipes BEFORE deleting the rows they point at — swipes.item_id is ON
-- DELETE CASCADE (001:36), so deleting a duplicate otherwise destroys real user
-- swipes and, through them, matches. INSERT ... ON CONFLICT rather than UPDATE
-- because a member may have swiped both copies, which would collide on the
-- (member_id, item_id) primary key.
--
-- The GROUP BY is load-bearing, exactly as in 023:228-234: ON CONFLICT DO UPDATE
-- raises "command cannot affect row a second time" when the source emits two
-- rows with the same conflict key, and that is the normal case here — a member
-- who swiped `Joe's` under `Seattle` and again under `Seattle, WA` produces
-- (member, keeper) twice. bool_or preserves a like on either copy so no existing
-- match is lost; min keeps the earlier swipe time.
INSERT INTO swipes (member_id, item_id, liked, created_at)
  SELECT s.member_id, m.keep_id, bool_or(s.liked), min(s.created_at)
    FROM swipes s
    JOIN items_locnorm_dupe_map m ON m.dupe_id = s.item_id
   GROUP BY s.member_id, m.keep_id
  ON CONFLICT (member_id, item_id)
  DO UPDATE SET liked = swipes.liked OR excluded.liked;

-- Same for the erasure snapshot (021:36-41), also ON DELETE CASCADE.
INSERT INTO matches (room_id, item_id, matched_at)
  SELECT ms.room_id, m.keep_id, ms.matched_at
    FROM matches ms
    JOIN items_locnorm_dupe_map m ON m.dupe_id = ms.item_id
  ON CONFLICT (room_id, item_id) DO NOTHING;

DELETE FROM items WHERE id IN (SELECT dupe_id FROM items_locnorm_dupe_map);

DROP TABLE items_locnorm_dupe_map;

-- 5d. Now the rename itself. Every surviving (category, title,
-- normalize_location(location)) is unique, so this cannot collide.
--
-- `WHERE location <> normalize_location(location)` is not just an optimization:
-- it keeps already-canonical rows from being rewritten, which matters because
-- `items` is not in the realtime publication but IS read by every deck load, and
-- there is no reason to churn ~thousands of tuples that are already correct.
UPDATE items
   SET location = normalize_location(location)
 WHERE location IS NOT NULL
   AND location <> normalize_location(location);

-- 5e. Room lists.
--
-- Routed through the same normalize_locations the trigger uses, so the backfill
-- and the trigger can never disagree — there is one implementation, called
-- twice. IS DISTINCT FROM skips rooms that are already canonical: `rooms` IS in
-- the realtime publication (006), so every row touched here pushes a
-- postgres_changes UPDATE to any connected client. For the rooms that do change
-- that is a feature — live sessions get the canonical list without a reload,
-- via SessionProvider.tsx:217-235 — but there is no point waking every other
-- room to tell it nothing happened.
UPDATE rooms
   SET locations = normalize_locations(locations)
 WHERE locations IS DISTINCT FROM normalize_locations(locations);

-- 5f. Drop the negative-cache markers whose location just moved.
--
-- places_fetches (027) is keyed (category, location) and its rows assert "a
-- complete fetch happened for THIS location and left result_count rows". After
-- 5c/5d that claim is stale for every location that was renamed: the bucket it
-- described has been merged into another one with a different row count. It
-- cannot be renamed instead — two markers can collide on the primary key, and
-- their result_counts do not add up to the merged bucket's size anyway.
--
-- Deleting is the honest answer, and it is 027's own stance (027:184-201): a
-- missing marker means the next request for that location spends ONE lookup,
-- fetches, and records the truth. Merged buckets at or above CACHE_TARGET (60)
-- do not even pay that — cacheVerdict serves on the count alone and never
-- consults the marker. This is also the deletion 027:203-206 asks for by hand
-- whenever items rows for a location are removed, which 5a just did.
--
-- No RLS problem: places_fetches has RLS on with zero policies and no grants
-- (027:78-85), but a migration in the SQL editor runs as the table's owner,
-- which is not subject to either.
DELETE FROM places_fetches
 WHERE location <> normalize_location(location)
    OR NOT EXISTS (SELECT 1 FROM items i
                    WHERE i.category = places_fetches.category
                      AND i.location = places_fetches.location);

COMMIT;

-- ---------------------------------------------------------------------------
-- 6. PROBE — run this after applying, to confirm the buckets actually merged
-- ---------------------------------------------------------------------------
-- Section 3 already proved the function matches the TS mirrors, or this file
-- would not have applied. These four confirm the DATA is now canonical. Every
-- one of them must come back 0 / empty; anything else means section 5 did not
-- finish and should be investigated before the next deploy.
--
--   -- (a) no items row is left un-normalized
--   SELECT count(*) FROM items
--    WHERE location IS NOT NULL AND location <> normalize_location(location);   -- expect 0
--
--   -- (b) no room list is left un-normalized (this is the one the trigger owns;
--   --     re-run it after poking rooms.locations by hand to confirm it fires)
--   SELECT count(*) FROM rooms
--    WHERE locations IS DISTINCT FROM normalize_locations(locations);           -- expect 0
--
--   -- (c) the junk probe rows are gone and 025's CHECK can now be validated
--   SELECT count(*) FROM items WHERE length(location) > 80;                     -- expect 0
--   ALTER TABLE items VALIDATE CONSTRAINT items_location_max_80;                -- optional
--
--   -- (d) THE POINT OF THE WHOLE MIGRATION: one bucket per place, not three.
--   --     Before, this listed `Seattle` at 20 and `Seattle, WA` at 60 as
--   --     separate rows. After, there is one row per real location, and no two
--   --     rows may differ only by case, comma spacing or whitespace.
--   SELECT location, count(*) AS items
--     FROM items WHERE category = 'restaurants'
--    GROUP BY location ORDER BY items DESC;
--
--   -- and the mechanical version of the same question:
--   SELECT normalize_location(location), count(DISTINCT location)
--     FROM items WHERE location IS NOT NULL
--    GROUP BY 1 HAVING count(DISTINCT location) > 1;                            -- expect no rows
--
-- MANUAL, one-time, expected: the first request for each merged location pays a
-- single Places lookup to rebuild its places_fetches marker (5f). That is
-- bounded by 023's global 200/day and happens once, ever, per location.
