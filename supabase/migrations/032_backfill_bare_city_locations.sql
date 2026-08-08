-- 032_backfill_bare_city_locations.sql
-- Correct the bare-city locations 031 deliberately left alone.
--
-- 031 grandfathered every regionless value already in the database and only
-- REPORTED them (031:51-72), because `Portland` is Oregon or Maine and a
-- migration that guesses silently changes which city a pair's deck shows.
-- That was the right call for a migration to make on its own. It is no longer
-- the state of the question: the owner has decided, for this app's live data,
-- that `Portland` means Portland, Oregon, and that the existing rows should be
-- corrected rather than left for someone to fix by hand.
--
-- So this file applies the decision as an EXPLICIT TABLE of bare name ->
-- canonical form, section 1. There is no inference here and there must never
-- be: nothing appends "the most likely state", nothing geocodes, nothing
-- matches fuzzily. A name is corrected because it is written down below, or it
-- is not corrected at all.
--
-- 031 IS NOT CHANGED. Its grandfathering stays exactly as it is, and it stays
-- as the safety net: any regionless value this file has no row for keeps
-- working, keeps being reported, and keeps waiting for a human. Section 5 below
-- lists whatever is left.
--
-- ---------------------------------------------------------------------------
-- ORDERING: APPLY AFTER 028 AND AFTER 031. BOTH, NOT EITHER.
-- ---------------------------------------------------------------------------
-- AFTER 028, because this file calls normalize_location() (028 section 1) in
-- every match it makes, and because it assumes items.location and
-- rooms.locations are already canonical — 028's section 5 backfill is what makes
-- them so. The keys below are matched as `normalize_location(value) = key`, so
-- a database where 028 has not run would still match, but its `Seattle` and
-- `seattle` rows would then both be repointed onto `Seattle, WA` and collide on
-- items' UNIQUE (category, title, location) in a way section 3's collision map
-- is not sized for. Run 028 first and that state cannot exist.
--
-- AFTER 031, because this file calls has_location_region() (031 section 1) to
-- assert that every canonical value it writes actually satisfies the rule, and
-- because rewriting rooms.locations fires 031's version of the
-- rooms_normalize_locations() trigger. That trigger refuses regionless entries
-- a write is ADDING; every value this file adds carries a region (asserted in
-- section 1), and every regionless entry it leaves behind was already on the
-- row and is therefore grandfathered by the trigger's OLD.locations comparison
-- (031:248-258). So the trigger cannot reject this backfill — but only because
-- 031's version of the function is the one installed. Applying this against
-- 028's version would work too; applying 028 AFTER this file would revert the
-- function body and lose the region rule, exactly as 031:272-276 warns.
--
-- ---------------------------------------------------------------------------
-- HOW THIS IS APPLIED
-- ---------------------------------------------------------------------------
-- By a human, by hand, in the Supabase SQL editor, like 028 and 031. Nothing in
-- CI applies migrations.
--
-- ---------------------------------------------------------------------------
-- SECTIONS 1-4 ARE ONE TRANSACTION, ONE EXECUTION, ONE SESSION
-- ---------------------------------------------------------------------------
-- Everything from `BEGIN;` to `COMMIT;` below must be submitted as a SINGLE
-- EXECUTION over a DIRECT, NON-POOLED connection — the `db.<project-ref>.
-- supabase.co` host on port 5432, not the transaction-mode pooler on 6543.
-- This is 028:473-500's rule, restated here because it is this file's rule too
-- and for the same two reasons:
--
--   ONE EXECUTION, because the atomicity IS the safety argument. `swipes.item_id`
--   and `matches.item_id` are ON DELETE CASCADE (001:36, 021:38), so a DELETE of
--   items that commits after a failed repoint destroys real user swipes and the
--   erasure snapshots 021 exists to preserve — permanently and silently. Any
--   tool that autocommits per statement turns this file into precisely that.
--   Select the whole range and run it once; do not paste it in pieces.
--
--   ONE SESSION, because a transaction split across backends is not a
--   transaction. A real apply of 028 section 5 failed with
--       ERROR: 42P01: relation "items_locnorm_dupe_map" does not exist
--   on the statement that READ a scratch table the previous statement had just
--   created. The SQL was in order and the CREATE ran; it simply ran on a
--   different backend from the read, where an uncommitted CREATE TABLE does not
--   exist. That can only happen if consecutive statements did not share one
--   session — which is what a pooled connection, or a client that submits each
--   statement as its own request, will do to you. Note the split originates on
--   the CLIENT: a conforming transaction-mode pooler does not split an open
--   transaction across backends, but a tool that sends each top-level statement
--   as its own request never gives it one to keep.
--
-- SO SECTIONS 1-4 ARE A SINGLE `DO $$ ... $$` BLOCK. This file carried exactly
-- the defect that killed 028's apply, three times over: bare_city_location_map,
-- bare_city_touched_buckets and bare_city_dupe_map were each created in one
-- top-level statement and read in others. A DO block is ONE statement, so
-- nothing can dispatch a create separately from its readers, and
-- supabase/migrations/migration-atomicity.test.ts fails the build if that shape
-- ever comes back.
--
-- The whole body is one block rather than three small ones because the three
-- scratch relations interleave: bare_city_location_map is read by 2a, 2b, 3a,
-- 3b, 3c AND 4, so the only statement boundary that can contain its create and
-- all of its uses is one that contains the entire correction. The BEGIN/COMMIT
-- around it is kept anyway — it costs nothing, it is what a reader expects to
-- see around a destructive backfill, and it still guarantees atomicity if
-- anyone ever adds a statement beside the block.
--
-- Sections 5 and 6 are outside it. Section 5 only reads permanent tables and
-- section 6 is comments, so neither has anything to be split.

-- ---------------------------------------------------------------------------
-- 1. THE MAPPING, and the proof that every entry in it is legal
-- ---------------------------------------------------------------------------
-- A literal list, not an algorithm. Each row says "this exact bare name, which
-- is currently ambiguous, means this exact canonical location".
--
-- WHAT IS IN THE LIST AND WHY. The first three are the ones 031:53-55 records
-- as real rows in live data — `Seattle`, `Portland`, `New Orleans`. The rest
-- are the other bare US metros a user plausibly typed into the pre-031 field,
-- included so that a second room holding `Chicago` is corrected by the same
-- deliberate decision rather than discovered later and fixed ad hoc. Every
-- canonical value is a string that already appears in CITY_SUGGESTIONS
-- (lib/cities.ts), which is the list the picker offers — so a corrected room
-- ends up holding exactly the value the user would now get by tapping the city
-- in Settings, not a second spelling of it.
--
-- `Portland` -> `Portland, OR` IS THE OWNER'S CALL, NOT AN INFERENCE.
-- `Portland, ME` is in CITY_SUGGESTIONS too (lib/cities.ts:256) and is an
-- equally real city; nothing about the string decides between them. This row
-- exists because the owner decided it, and it is written here as one line so
-- that reversing the decision is one line. If a specific room is known to have
-- meant Maine, fix that room by hand BEFORE applying this file — afterwards the
-- guess is indistinguishable from a choice, which is the exact irreversibility
-- 031:56-59 refused to create on its own authority.
--
-- WHAT IS DELIBERATELY NOT IN THE LIST. Ambiguous-in-the-same-way names that
-- nobody has decided (`Springfield`, `Columbus`, `Kansas City`, `Charleston`,
-- `Rochester`), and every non-US bare city. They stay grandfathered under 031
-- and are reported by section 5. A missing entry costs nothing; a wrong entry
-- moves a couple's deck to another city.
--
-- Section 1 still runs FIRST and still touches no user data. It no longer runs
-- outside the transaction — it cannot, the block is one statement — but the
-- guarantee that mattered is unchanged and slightly stronger: its assertions
-- RAISE before the LOCK is taken and before a single row is modified, and the
-- abort now rolls back the map table too rather than leaving it for the next
-- attempt to drop.
BEGIN;

DO $$
DECLARE
  bad text;
BEGIN
  -- Residue from an apply of an EARLIER VERSION of this file, which created
  -- these three as permanent tables and could autocommit them on some backend.
  -- Schema-qualified so each unambiguously targets that leftover and never the
  -- TEMP relation of the same name created below it. Same preamble, and same
  -- reason, as 028:607-610.
  DROP TABLE IF EXISTS public.bare_city_location_map;
  DROP TABLE IF EXISTS public.bare_city_touched_buckets;
  DROP TABLE IF EXISTS public.bare_city_dupe_map;

  -- TEMP ... ON COMMIT DROP for 028:600-604's reason: the map goes away when
  -- this transaction ends whether it commits or aborts, so no retry can trip
  -- over residue from the previous attempt, and TEMP makes it private to this
  -- session so two people applying this file at once cannot read each other's
  -- map. It survives from here to section 4 because all of that is inside one
  -- statement, hence one transaction.
  CREATE TEMP TABLE bare_city_location_map (
    bare      text PRIMARY KEY,
    canonical text NOT NULL
  ) ON COMMIT DROP;

  -- The list itself. lib/location-backfill-map.test.ts parses these lines out of
  -- this file and re-checks every entry against the TypeScript normalizeLocation
  -- and hasRegion, so a typo here fails `npx jest` on a laptop with no Postgres —
  -- the same trick the 028 work used. Keep each pair on one line, in this shape,
  -- or that test stops seeing it (it asserts the count, so it cannot silently
  -- parse nothing).
  INSERT INTO bare_city_location_map (bare, canonical) VALUES
    ('Portland', 'Portland, OR'),
    ('Seattle', 'Seattle, WA'),
    ('New Orleans', 'New Orleans, LA'),
    ('Chicago', 'Chicago, IL'),
    ('Los Angeles', 'Los Angeles, CA'),
    ('San Francisco', 'San Francisco, CA'),
    ('New York', 'New York, NY'),
    ('Houston', 'Houston, TX'),
    ('Boston', 'Boston, MA'),
    ('Denver', 'Denver, CO'),
    ('Austin', 'Austin, TX'),
    ('Miami', 'Miami, FL'),
    ('Atlanta', 'Atlanta, GA'),
    ('Philadelphia', 'Philadelphia, PA'),
    ('Phoenix', 'Phoenix, AZ'),
    ('San Diego', 'San Diego, CA'),
    ('Dallas', 'Dallas, TX'),
    ('Nashville', 'Nashville, TN');

  -- Prove the whole mapping is legal BEFORE any data is touched.
  --
  -- Same discipline as 028 section 3 and 031 section 2, and for the same reason:
  -- this file cannot be run against a real database from a laptop, so every
  -- property it depends on is written as an assertion that aborts the apply. An
  -- abort here leaves nothing behind at all — the map is ON COMMIT DROP, so a
  -- retry starts from a clean slate.
  --
  -- Each check exists because breaking it breaks something specific:
  --   (a) canonical is a fixed point of normalize_location — otherwise the value
  --       written into rooms.locations is immediately rewritten by 028's trigger
  --       into something else, and items.location ends up in a bucket the client
  --       never asks for.
  --   (b) canonical satisfies has_location_region — otherwise this migration
  --       replaces one regionless value with another and 031's trigger rejects
  --       the write outright.
  --   (c) bare is a fixed point too — the match in sections 2-3 is
  --       `normalize_location(stored) = bare`, so a key that is not itself
  --       canonical can never match anything and would silently do nothing.
  --   (d) bare has NO region — a key with a region is not a bare city, it is a
  --       typo in this list, and it would rewrite already-correct rows.
  --   (e) bare <> canonical, or the entry is a no-op pretending to be a fix.
  --   (f) canonical values are distinct — two bare names collapsing onto one
  --       canonical form is not a case this file's collision handling was
  --       reasoned about, and it is far more likely to be a copy-paste error.
  --   (g) canonical fits 80 characters — items.location's CHECK (025) is NOT
  --       VALID, which means it is not enforced at rest but IS enforced on every
  --       UPDATE, so an over-long value would abort section 3 mid-transaction
  --       with a bare constraint violation. 027's places_fetches carries the same
  --       cap.
  SELECT string_agg(msg, E'\n') INTO bad FROM (
    SELECT format('%L -> %L: canonical is not canonical (normalize_location gives %L)',
                  bare, canonical, normalize_location(canonical)) AS msg
      FROM bare_city_location_map WHERE normalize_location(canonical) <> canonical
    UNION ALL
    SELECT format('%L -> %L: canonical has no region', bare, canonical)
      FROM bare_city_location_map WHERE NOT has_location_region(canonical)
    UNION ALL
    SELECT format('%L: bare key is not canonical (normalize_location gives %L) and can never match',
                  bare, normalize_location(bare))
      FROM bare_city_location_map WHERE normalize_location(bare) <> bare
    UNION ALL
    SELECT format('%L: bare key already carries a region — it is not a bare city', bare)
      FROM bare_city_location_map WHERE has_location_region(bare)
    UNION ALL
    SELECT format('%L: maps to itself', bare)
      FROM bare_city_location_map WHERE bare = canonical
    UNION ALL
    SELECT format('%L is the target of %s different bare names', canonical, count(*))
      FROM bare_city_location_map GROUP BY canonical HAVING count(*) > 1
    UNION ALL
    SELECT format('%L -> %L: canonical is %s characters, over the 80-char cap (025, 027)',
                  bare, canonical, length(canonical))
      FROM bare_city_location_map WHERE length(canonical) > 80
  ) t;

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'bare_city_location_map is not applicable:\n%', bad;
  END IF;

  IF (SELECT count(*) FROM bare_city_location_map) = 0 THEN
    RAISE EXCEPTION 'bare_city_location_map is empty — the INSERT above did not run';
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. THE CORRECTION
  -- -------------------------------------------------------------------------

  -- Blocks concurrent writers to `items` for the rest of the transaction, for
  -- 028:506-510's reason: the collision map in section 3 is a snapshot, and a live
  -- get-restaurants request that commits a new row after it is taken would be
  -- absent from the map, survive the DELETE, and then collide on
  -- items_category_title_location_key (023:255-257) when the repoint runs.
  --
  -- Taken here, after section 1's assertions and before the first read of
  -- `items`, so it covers exactly the same window as before: every statement
  -- that touches items — 2a's snapshot, 3a, 3b and 3c — is inside it, and a
  -- mapping that was going to fail its assertions never takes the lock at all.
  --
  -- `rooms` gets NO lock, again as 028:512. The rooms rewrite below is
  -- self-referential — it recomputes from `rooms.locations` rather than from a
  -- snapshot — so under READ COMMITTED a row updated by a concurrent writer is
  -- re-read and re-evaluated rather than clobbered with a stale array.
  LOCK TABLE items IN EXCLUSIVE MODE;

  -- 2a. Which cache buckets this migration is about to change the contents of.
  --
  -- Taken BEFORE anything is modified, because after section 3 the bare rows no
  -- longer exist to be counted. Both sides of every affected mapping are
  -- recorded: the bare bucket, whose rows are leaving, and the canonical bucket,
  -- whose row count is changing underneath it. Section 4 turns this into
  -- places_fetches deletions.
  --
  -- This is a pre-mutation snapshot and cannot be folded into section 4 as a CTE:
  -- by the time section 4 runs, the rows it is derived from are gone. So it stays
  -- a relation — TEMP now, and reachable from section 4 only because sections
  -- 2b and 3, which run in between, are inside this same statement.
  CREATE TEMP TABLE bare_city_touched_buckets ON COMMIT DROP AS
    SELECT DISTINCT i.category, l.loc AS location
      FROM items i
      JOIN bare_city_location_map m ON m.bare = normalize_location(i.location)
      CROSS JOIN LATERAL (VALUES (m.bare), (m.canonical)) AS l(loc)
     WHERE i.location IS NOT NULL;

  -- 2b. Room lists: replace each bare entry with its canonical form, dedupe, keep
  -- the user's ordering.
  --
  -- The dedupe is the load-bearing half. A room holding BOTH `Seattle` and
  -- `Seattle, WA` — which is exactly what a couple ends up with after one partner
  -- re-added the city from the new picker while the legacy chip was still there —
  -- would otherwise come out holding `Seattle, WA` twice: two identical chips in
  -- Settings and two identical deck fetches. DISTINCT ON keeps the lowest
  -- ordinality per canonical value and the outer array_agg re-sorts by it, so the
  -- survivor sits where the FIRST of the two sat. Same shape, deliberately, as
  -- normalize_locations (028:245-253).
  --
  -- rooms_locations_max_10 (018:30-32) cannot be tripped: the remap is one-for-one
  -- per entry and the dedupe only ever removes entries, so the new array is at
  -- most as long as the old one, which already satisfied the CHECK. (The CHECK is
  -- NOT VALID, so it is not enforced at rest but IS enforced on this UPDATE —
  -- which is why "at most as long" is the property that matters rather than "10 or
  -- fewer".)
  --
  -- 031's trigger fires on this UPDATE and cannot reject it. Everything the write
  -- ADDS is a canonical value with a region (section 1 asserted that); everything
  -- regionless that survives is an unmapped entry that was already on the row, so
  -- it is in the trigger's `grandfathered` set (031:249). The trigger's own
  -- normalize_locations pass is then a no-op on an already-canonical array.
  --
  -- WHERE EXISTS rather than "where the value would change": both are the same
  -- set here — a room is touched exactly when it holds a mapped bare entry — and
  -- this form is cheap and reads as what it means. `rooms` IS in the realtime
  -- publication (006), so every row touched pushes a postgres_changes UPDATE to
  -- any connected client; for these rooms that is the point (the corrected list
  -- arrives without a reload, SessionProvider.tsx:217-235), but there is no reason
  -- to wake a room that holds nothing this file maps.
  UPDATE rooms
     SET locations = (
       SELECT coalesce(array_agg(d.loc ORDER BY d.ord), '{}'::text[])
         FROM (
           SELECT DISTINCT ON (x.v) x.v AS loc, x.ord
             FROM (
               SELECT coalesce(m.canonical, u.l) AS v, u.ord AS ord
                 FROM unnest(rooms.locations) WITH ORDINALITY AS u(l, ord)
                 LEFT JOIN bare_city_location_map m ON m.bare = normalize_location(u.l)
                -- normalize_location is STRICT, so a NULL element (only a raw
                -- PostgREST PATCH can produce one) joins to nothing and would
                -- survive as a NULL. 028's normalize_locations drops those; drop
                -- it here too rather than hand the trigger an array to clean up.
                WHERE u.l IS NOT NULL
             ) x
            ORDER BY x.v, x.ord
         ) d
     )
   WHERE EXISTS (
     SELECT 1
       FROM unnest(rooms.locations) AS l
       JOIN bare_city_location_map m ON m.bare = normalize_location(l)
   );

  -- -------------------------------------------------------------------------
  -- 3. items — REPOINT WHAT IS REFERENCED, DELETE WHAT IS NOT. NEVER BOTH.
  -- -------------------------------------------------------------------------
  -- The reason 028 repoints rather than deletes is not tidiness, it is that
  -- `swipes.item_id` and `matches.item_id` are ON DELETE CASCADE (001:36,
  -- 021:38): deleting a stale items row destroys the swipe history that produced a
  -- pair's matches, and the `matches` snapshot rows that 021 wrote precisely so
  -- that a partner's match history survives the other partner's erasure. Losing
  -- one of those undoes 021.
  --
  -- But that reason only applies to rows something actually references. A bare
  -- `Portland` row nobody has swiped and no snapshot mentions carries no history
  -- at all — and it is data of unknown provenance: it was fetched with the query
  -- "best restaurants in Portland", so repointing it to `Portland, OR` INHERITS
  -- whatever Google resolved that ambiguous name to. Almost certainly Oregon
  -- (Places ranks on prominence and Oregon's Portland is far larger), which is
  -- what the owner assumed — but inherited, not established.
  --
  -- So the two cases are handled differently, and the split is by reference, not
  -- by shape:
  --
  --   REFERENCED (a swipe or a match row points at it) -> REPOINT it, with the
  --   full collision machinery below. History wins over provenance; a card that
  --   is very probably the right restaurant beats a hole in someone's swipe log.
  --
  --   UNREFERENCED -> DELETE it. Nothing is lost, and the location then refetches
  --   under the unambiguous `Portland, OR` query on its next request, producing
  --   rows that are correct BY CONSTRUCTION rather than by inheritance. Section 4
  --   is what makes that refetch actually happen; the two halves only work
  --   together.
  --
  -- Both `swipes` and `matches` are checked, and `matches` is the one that must
  -- not be got wrong: it is the erasure snapshot, its rows are frequently the ONLY
  -- surviving record of a match (021:21-35), and there is no member row left to
  -- reconstruct them from.

  -- 3a. Delete the bare rows nothing references.
  --
  -- This runs BEFORE the collision map so the map only has to reason about rows
  -- that are actually staying. Note what it deliberately does NOT do: it does not
  -- prefer the richer copy the way 3b does. An unreferenced bare row with a photo
  -- still goes, because a photo attached to an inherited row is not a reason to
  -- keep the inherited row — the refetch brings back both the photo and a title
  -- that is certainly in the right city.
  --
  -- items_location_max_80 (025, NOT VALID) is not a hazard here: this only deletes,
  -- and the only rows it can match are ones whose location equals an 80-or-fewer
  -- character key from section 1. 028's section 5a already removed the legacy
  -- over-long junk rows in any case.
  DELETE FROM items i
   USING bare_city_location_map m
   WHERE i.location IS NOT NULL
     AND m.bare = normalize_location(i.location)
     AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.item_id = i.id)
     AND NOT EXISTS (SELECT 1 FROM matches ms WHERE ms.item_id = i.id);

  -- 3b. Collapse the rows the repoint is about to collide.
  --
  -- `items` carries UNIQUE (category, title, location) from 023:255-257, so
  -- moving a surviving `Portland` row to `Portland, OR` fails outright wherever
  -- the same restaurant already exists under the canonical name. The losers must
  -- therefore be merged away BEFORE the UPDATE — after is not an option, the
  -- UPDATE would simply error.
  --
  -- This is 028 section 5c's shape, reused rather than reinvented: same TEMP
  -- ON COMMIT DROP scratch relation, same keeper preference, same
  -- repoint-then-delete order, same GROUP BY and same conflict actions. What
  -- differs is only the partition key. 028 grouped by
  -- normalize_location(location), because normalization was the thing about to
  -- collide; here the colliding key is the REMAPPED location, so the partition is
  -- `coalesce(canonical, location)`. The two could not be shared as one statement
  -- without making 028's file depend on a mapping table that did not exist when it
  -- was written.
  --
  -- WHY A SCRATCH RELATION RATHER THAN CTEs, 028:590-597's argument exactly: the
  -- three consumers must run in this ORDER — repoint swipes, repoint matches, and
  -- only then delete the losers. Data-modifying CTEs in a single statement all see
  -- the same snapshot and execute in no defined order, so folding them together
  -- would put the DELETE's ON DELETE CASCADE into a race with the INSERTs that
  -- rescue those exact rows.
  --
  -- Scoped to `location IS NOT NULL`, like 023's constraint and 028's map: the
  -- constraint uses PostgreSQL's default NULLS DISTINCT, so the
  -- location-independent catalogue rows (food, vacations, shows — 001:26-29) never
  -- conflict with each other and must not be touched.
  --
  -- The inner scan is narrowed to rows that can possibly collide — a bare row, or
  -- a row already sitting at one of the canonical targets. Everything else is a
  -- group of one by 023's constraint and would only be filtered back out below.
  --
  -- Keeper preference copied verbatim from 028:612-617 (itself from 023:206-216),
  -- and for its reason: duplicates are NOT interchangeable. resolvePhotoUrl
  -- returns null on any photo failure and price_level stays null until Foursquare
  -- fills it, so choosing blind by uuid can keep the impoverished copy and delete
  -- the enriched one, irreversibly once the DELETE below runs. Prefer a row with
  -- an image and a price, then fall back to id so the result is deterministic.
  --
  -- Deliberately NOT changed to "prefer the row already at the canonical
  -- location". A collision means two rows share a category AND a title AND a
  -- target location, so they are the same restaurant in the same city — the
  -- provenance argument that justifies 3a says nothing about which of two rows
  -- describing one place should survive, while the photo and price difference is
  -- real and visible on the card.
  CREATE TEMP TABLE bare_city_dupe_map ON COMMIT DROP AS
    SELECT id AS dupe_id,
           first_value(id) OVER (
             PARTITION BY category, title, target
             ORDER BY (image_url IS NULL), (price_level IS NULL), id
           ) AS keep_id
      FROM (
        SELECT i.id, i.category, i.title, i.image_url, i.price_level,
               coalesce(m.canonical, i.location) AS target
          FROM items i
          LEFT JOIN bare_city_location_map m ON m.bare = normalize_location(i.location)
         WHERE i.location IS NOT NULL
           AND (m.canonical IS NOT NULL
                OR i.location IN (SELECT canonical FROM bare_city_location_map))
      ) t;

  DELETE FROM bare_city_dupe_map WHERE dupe_id = keep_id;

  -- Repoint swipes BEFORE deleting the rows they point at. INSERT ... ON CONFLICT
  -- rather than UPDATE because a member may have swiped BOTH copies — `Joe's`
  -- under `Portland` and again under `Portland, OR` — which would collide on the
  -- (member_id, item_id) primary key.
  --
  -- The GROUP BY is load-bearing, exactly as in 028:635-640 and 023:228-234: ON
  -- CONFLICT DO UPDATE raises "command cannot affect row a second time" when the
  -- source emits two rows with the same conflict key, and a member who swiped both
  -- copies produces (member, keeper) twice. bool_or preserves a like on either
  -- copy, so no existing match is lost; min keeps the earlier swipe time.
  --
  -- DO UPDATE rather than DO NOTHING on the conflict, also from 028: DO NOTHING
  -- would drop a like recorded only on the copy being deleted whenever the member
  -- had already passed on the survivor, which silently unmakes a match.
  INSERT INTO swipes (member_id, item_id, liked, created_at)
    SELECT s.member_id, m.keep_id, bool_or(s.liked), min(s.created_at)
      FROM swipes s
      JOIN bare_city_dupe_map m ON m.dupe_id = s.item_id
     GROUP BY s.member_id, m.keep_id
    ON CONFLICT (member_id, item_id)
    DO UPDATE SET liked = swipes.liked OR excluded.liked;

  -- Same for the erasure snapshot (021:36-41), also ON DELETE CASCADE. DO NOTHING
  -- here because the row carries no field to merge — (room_id, item_id) IS the
  -- whole fact, and matched_at is when the snapshot was taken, not when anyone
  -- swiped (021:29-32), so keeping the existing one loses nothing.
  INSERT INTO matches (room_id, item_id, matched_at)
    SELECT ms.room_id, m.keep_id, ms.matched_at
      FROM matches ms
      JOIN bare_city_dupe_map m ON m.dupe_id = ms.item_id
    ON CONFLICT (room_id, item_id) DO NOTHING;

  -- Now safe: every swipe and every snapshot row that pointed at a loser has been
  -- re-pointed at its keeper, so this DELETE's cascade reaches nothing that is not
  -- already represented on the survivor.
  DELETE FROM items WHERE id IN (SELECT dupe_id FROM bare_city_dupe_map);

  -- 3c. The repoint itself.
  --
  -- Every surviving (category, title, remapped location) is now unique, so this
  -- cannot collide. Note that the keeper of a collision group may itself be the
  -- bare row (when it held the photo and the canonical copy did not) — in that
  -- case the canonical copy has just been deleted, and this statement is what
  -- moves the survivor onto the name that copy vacated.
  UPDATE items i
     SET location = m.canonical
    FROM bare_city_location_map m
   WHERE i.location IS NOT NULL
     AND m.bare = normalize_location(i.location);

  -- -------------------------------------------------------------------------
  -- 4. places_fetches — clear the markers for every bucket that moved
  -- -------------------------------------------------------------------------
  -- A places_fetches row (027) asserts "a complete fetch happened for THIS
  -- (category, location) and left result_count rows in items". Section 3 changed
  -- what is in those buckets, so for the locations it touched that claim is now
  -- false in both directions, and the two halves need different justifications.
  --
  -- THE BARE KEYS' MARKERS ARE DELETED, unconditionally, whether or not any items
  -- row existed under them. They are markers under a name nothing can reference
  -- any more: no room holds it (section 2b rewrote them all), and 031's edge-
  -- function guard 400s a regionless location outright, so no request can ever
  -- reach this row again. Leaving it is harmless and untidy; deleting it costs
  -- nothing at all, because a marker that can never be read cannot cause a
  -- refetch when it goes.
  --
  -- THE CANONICAL KEYS' MARKERS ARE DELETED ONLY WHERE ITEMS ACTUALLY MOVED, and
  -- this one is not tidiness — it is the half that makes 3a a correction instead
  -- of data loss. Deleting unreferenced bare rows is only worth doing because the
  -- location then refetches under the unambiguous name; if the canonical bucket
  -- still carried a `fresh` marker it would be served at its new, smaller count as
  -- "fetched, and this is genuinely all there is", suppressing exactly the refetch
  -- that produces the correct data. 027:203-206 asks for this deletion by hand
  -- whenever items rows for a location are removed; this is that deletion, done
  -- automatically for the rows this file removed.
  --
  -- Renaming the bare marker onto the canonical key instead was considered and is
  -- wrong for 028:693-695's reason: two markers can collide on the primary key,
  -- and their result_counts do not describe the merged bucket anyway.
  --
  -- Scoped to touched buckets rather than to the whole mapping, deliberately.
  -- Deleting `Miami, FL`'s marker when no room and no item ever mentioned a bare
  -- `Miami` would spend a Places lookup to re-learn something that was already
  -- true.
  --
  -- No RLS problem: places_fetches has RLS on with zero policies and no grants
  -- (027:78-85), but a migration in the SQL editor runs as the table's owner,
  -- which is subject to neither.
  --
  -- HONEST LIMIT, stated rather than glossed. Clearing a marker forces a refetch
  -- only for a bucket that is BELOW CACHE_TARGET; cacheVerdict short-circuits on
  -- `count >= 60` before it ever consults the marker (get-restaurants/logic.ts:182).
  -- A canonical location still holding 60+ rows after section 3 therefore keeps
  -- serving them, marker or no marker. That is the right outcome and not a gap:
  -- a bucket that is already full at the canonical name is full of rows fetched
  -- under the canonical name, and the handful repointed into it are a rounding
  -- error on the deck. The case the deletion exists for is the other one — a
  -- canonical bucket that was empty or thin, which is exactly where the refetch
  -- matters.
  DELETE FROM places_fetches p
   USING bare_city_location_map m
   WHERE p.location = m.bare;

  DELETE FROM places_fetches p
   USING bare_city_touched_buckets t
   WHERE p.category = t.category
     AND p.location = t.location;

  -- No DROPs here. All three scratch relations are ON COMMIT DROP, so they go
  -- away when this transaction ends whether it commits or aborts.
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- 5. WHAT IS LEFT — reported, not guessed
-- ---------------------------------------------------------------------------
-- Anything still regionless after the backfill is a value section 1 has no row
-- for, and it stays exactly as 031 left it: grandfathered, working, and waiting
-- for a human. This block is 031 section 3's report re-run against the corrected
-- data, so the list it prints is the genuine remainder rather than the original
-- one.
--
-- In the Supabase SQL editor these arrive under Messages/Notices, not in the
-- results grid. Section 6 has the same questions as ordinary SELECTs if that
-- panel is easy to miss.
DO $$
DECLARE
  r record;
  rooms_left integer := 0;
  items_left integer := 0;
BEGIN
  FOR r IN
    SELECT id, code, array_agg(l ORDER BY ord) AS regionless
      FROM rooms, LATERAL unnest(locations) WITH ORDINALITY AS u(l, ord)
     WHERE NOT has_location_region(l)
     GROUP BY id, code
     ORDER BY id
  LOOP
    rooms_left := rooms_left + 1;
    RAISE NOTICE 'STILL REGIONLESS: room % (code %) holds %', r.id, r.code, r.regionless;
  END LOOP;

  FOR r IN
    SELECT location, count(*) AS n
      FROM items
     WHERE location IS NOT NULL AND NOT has_location_region(location)
     GROUP BY location
     ORDER BY count(*) DESC
  LOOP
    items_left := items_left + 1;
    RAISE NOTICE 'STILL REGIONLESS: % items rows tagged %', r.n, r.location;
  END LOOP;

  IF rooms_left = 0 AND items_left = 0 THEN
    RAISE NOTICE 'Nothing regionless is left in rooms.locations or items.location.';
  ELSE
    RAISE NOTICE '% room(s) and % items location(s) above are NOT in this migration''s mapping.', rooms_left, items_left;
    RAISE NOTICE 'They stay GRANDFATHERED by 031 — this file does not guess at a name it was not told.';
    RAISE NOTICE 'To correct one: add its bare name and the decided canonical form to section 1 and re-apply,';
    RAISE NOTICE 'or fix the room in the app (remove the bare chip, add the right city from the picker).';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. PROBE — run these after applying
-- ---------------------------------------------------------------------------
-- Section 1 already proved the mapping is legal, or this file would not have
-- applied. These confirm the DATA moved.
--
--   -- (a) no mapped bare name survives anywhere. Expect no rows.
--   --     (Re-state the pairs you applied; the map table is dropped by then.)
--   SELECT 'room' AS where_, r.id::text AS id, l AS value
--     FROM rooms r, LATERAL unnest(r.locations) AS l
--    WHERE l IN ('Portland','Seattle','New Orleans','Chicago','Los Angeles',
--                'San Francisco','New York','Houston','Boston','Denver','Austin',
--                'Miami','Atlanta','Philadelphia','Phoenix','San Diego','Dallas',
--                'Nashville')
--   UNION ALL
--   SELECT 'item', i.id::text, i.location FROM items i
--    WHERE i.location IN ('Portland','Seattle','New Orleans','Chicago','Los Angeles',
--                'San Francisco','New York','Houston','Boston','Denver','Austin',
--                'Miami','Atlanta','Philadelphia','Phoenix','San Diego','Dallas',
--                'Nashville');
--
--   -- (b) no room ended up holding the same location twice
--   SELECT id, code, locations FROM rooms
--    WHERE array_length(locations, 1)
--          IS DISTINCT FROM (SELECT count(DISTINCT l) FROM unnest(locations) AS l);
--
--   -- (c) what is still regionless — the same question section 5 raises as a
--   --     NOTICE, as an ordinary query. These are 031's remainder, not a failure.
--   SELECT id, code, l AS regionless_location
--     FROM rooms, LATERAL unnest(locations) AS l
--    WHERE NOT has_location_region(l) ORDER BY id;
--
--   SELECT location, count(*) AS items FROM items
--    WHERE location IS NOT NULL AND NOT has_location_region(location)
--    GROUP BY location ORDER BY items DESC;
--
--   -- (d) nothing lost history. Every swipe and every erasure snapshot still
--   --     points at a live item — the FKs guarantee it, so this is really a check
--   --     that the repoint ran before the delete rather than after.
--   SELECT count(*) FROM swipes s
--    WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = s.item_id);   -- expect 0
--   SELECT count(*) FROM matches ms
--    WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = ms.item_id);  -- expect 0
--
--   -- (e) the corrected buckets and their sizes. A canonical location sitting
--   --     well below 60 here is the expected state right after applying — it
--   --     refills on its next request (see the cost note below).
--   SELECT location, count(*) AS items FROM items
--    WHERE category = 'restaurants' GROUP BY location ORDER BY items DESC;
--
-- EXPECTED ONE-TIME COST: each location whose marker section 4 cleared pays a
-- single Places lookup on its next request, once, ever. That is bounded by 023's
-- global 200/day ceiling and per-user 50/day, and it is the price of refetching
-- under an unambiguous city name instead of keeping rows fetched under a bare
-- one.
