-- 025_items_location_length.sql
-- The 80-character location cap has only ever existed in application code
-- (MAX_LOCATION_LEN, get-restaurants/logic.ts:7). Nothing enforced it in the
-- database, which is how 20 rows carrying 3,000 characters of 'A' got in before
-- the cap shipped in PR #2. They were found again by the 2026-07-28 review and
-- had to be trimmed by hand before 023 could add UNIQUE (category, title,
-- location) -- a btree index tuple cannot exceed 2704 bytes, so an untrimmed row
-- fails the index build outright.
--
-- This is the backstop that keeps that from recurring. It is not defence against
-- a live attack path: get-restaurants already rejects an over-long location with
-- a 400 before it can reach `items`, and the only writer of this column is that
-- function. It is defence against the cap being lowered, moved, or lost in a
-- refactor while the data outlives the code that guarded it.
--
-- NULL passes, deliberately. `length(NULL)` is NULL and a CHECK only fails on an
-- explicit false, so the location-independent catalogue rows (food, vacations,
-- shows -- 001:26-29) are unaffected. That is the intent: this constrains
-- location-tagged rows only, the same scope as 023's UNIQUE constraint.
--
-- 80 is duplicated from MAX_LOCATION_LEN rather than derived. There is no way to
-- share a constant between Deno and Postgres here; if that cap ever changes,
-- this constraint has to change with it.

-- NOT VALID, following 018:31-32 (`rooms_locations_max_10`). New and updated rows
-- are checked immediately; existing rows are not scanned, so this applies in
-- milliseconds and cannot abort on data that predates it.
--
-- If you have already run the truncation
--   UPDATE items SET location = left(location, 80) WHERE length(location) > 80;
-- then every row complies and you can validate right away. Validating takes a
-- SHARE UPDATE EXCLUSIVE lock -- it does not block reads or writes:
--   SELECT count(*) FROM items WHERE length(location) > 80;  -- expect 0
--   ALTER TABLE items VALIDATE CONSTRAINT items_location_max_80;
--
-- Until it is validated the constraint is still fully enforced on writes. Leaving
-- it NOT VALID forever is safe; validating only lets the planner trust it.
ALTER TABLE items
  ADD CONSTRAINT items_location_max_80
  CHECK (length(location) <= 80) NOT VALID;
