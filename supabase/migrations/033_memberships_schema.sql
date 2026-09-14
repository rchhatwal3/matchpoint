-- 033_memberships_schema.sql
-- T13: one person, many rooms.
--
-- WHY. members.id IS the caller's auth.uid() and it is the primary key, so a
-- person belongs to exactly one room forever. On 2026-09-09 that produced a
-- room with a single member who had accumulated 80 swipes and 69 likes over six
-- weeks and could never match, because room_matches requires two distinct
-- members. Her partner was in a different, full room. Neither could reach the
-- other from inside the app and the situation needed direct database writes.
--
-- WHY ALTER AND NOT RECREATE. Every grant on these tables is load-bearing and
-- some are column-scoped (rooms.locations/price_tiers UPDATE; matches carries
-- SELECT on (room_id, item_id) but deliberately NOT matched_at). Table-level
-- privileges automatically extend to columns added later, so ALTER preserves
-- the whole grant surface for free. A drop-and-recreate would silently reset it
-- and either break the matches screen or leak matched_at.
--
-- WHY THE COMPOSITE KEY AND NOT A SURROGATE membership_id. Because a swipe row
-- then carries its own room_id, so 034 can reduce every policy to one
-- is_room_member() call. swipes_select_same_room currently resolves
-- member_room_id() TWICE in one expression and was flagged by the 2026-07-28
-- review as the likeliest of the five policies to break. The composite FK also
-- makes it impossible for a swipe's room_id to disagree with its membership, so
-- the denormalisation cannot drift.

BEGIN;

-- swipes.member_id references members(id); that FK has to go before the
-- members primary key can be replaced.
ALTER TABLE public.swipes DROP CONSTRAINT swipes_member_id_fkey;

-- ---- members: id -> (user_id, room_id) ----

ALTER TABLE public.members ADD COLUMN user_id uuid;
UPDATE public.members SET user_id = id;
ALTER TABLE public.members ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.members DROP CONSTRAINT members_pkey;
ALTER TABLE public.members ADD CONSTRAINT members_pkey PRIMARY KEY (user_id, room_id);

-- Re-point the auth.users FK at the new column and keep it NOT VALID, exactly
-- as members_id_auth_users_fkey was. Validating it now would fail on any row
-- whose auth user has already been deleted.
ALTER TABLE public.members DROP CONSTRAINT members_id_auth_users_fkey;
ALTER TABLE public.members
  ADD CONSTRAINT members_user_id_auth_users_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

-- members.id itself is dropped further down, once nothing still reads it.

-- ---- swipes: member_id -> (user_id, room_id) ----

ALTER TABLE public.swipes ADD COLUMN user_id uuid;
ALTER TABLE public.swipes ADD COLUMN room_id uuid;

-- Backfill from the membership each swipe belonged to. members.user_id was just
-- populated from the same uuid space as swipes.member_id, so this joins cleanly.
UPDATE public.swipes s
   SET user_id = m.user_id,
       room_id = m.room_id
  FROM public.members m
 WHERE m.user_id = s.member_id;

-- A swipe whose member row is already gone cannot be attributed to a room and
-- would violate the FK below. There should be none — swipes_member_id_fkey was
-- ON DELETE CASCADE — but assert rather than assume, because the alternative is
-- a failed apply halfway through.
DO $$
DECLARE v_orphans bigint;
BEGIN
  SELECT count(*) INTO v_orphans FROM public.swipes WHERE user_id IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'aborting: % swipe rows have no member row to attribute', v_orphans;
  END IF;
END $$;

ALTER TABLE public.swipes ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.swipes ALTER COLUMN room_id SET NOT NULL;

-- ---- detach everything that still reads members.id or swipes.member_id ----
--
-- Postgres refuses DROP COLUMN while a view or policy references the column.
-- Read from production's pg_depend, exactly five objects do besides the
-- constraints handled above: four policies and the room_matches view. No
-- CASCADE anywhere: it would drop room_matches and silently take the
-- GRANT SELECT from 004_grants.sql:15 with it.
--
-- THE WINDOW. The four policies are re-created in 034, not here. From this
-- transaction's commit until 034's, members has no SELECT policy and swipes no
-- SELECT, INSERT or UPDATE policy; with row-level security on, that denies
-- every client read and write of them. rooms and matches policies still call
-- private.member_room_id, whose body reads the dropped members.id, so their
-- reads error instead. Every path fails closed, nothing is exposed, and 033,
-- 034 and 035 are pushed as one batch, so the window is the gap between them.
DROP POLICY members_select_same_room ON public.members;
DROP POLICY swipes_select_same_room ON public.swipes;
DROP POLICY swipes_insert_own ON public.swipes;
DROP POLICY swipes_update_own ON public.swipes;

-- The view loses its join. It no longer has to reach through members to
-- discover a swipe's room, so the mutual-like half groups on swipes.room_id
-- directly. security_invoker stays true: the caller's own policies must apply.
-- CREATE OR REPLACE requires the output columns to match 022:98-122 exactly —
-- room_id, item_id, category, title, subtitle, image_url, in that order and
-- with the same types (s.room_id is uuid, as m.room_id was) — and replacing
-- rather than dropping is what keeps 004's grant. This is the view's only
-- definition in the T13 migrations.
CREATE OR REPLACE VIEW public.room_matches
WITH (security_invoker = true) AS
  SELECT s.room_id, s.item_id, i.category, i.title, i.subtitle, i.image_url
    FROM swipes s
    JOIN items i ON i.id = s.item_id
   WHERE s.liked = true
   GROUP BY s.room_id, s.item_id, i.category, i.title, i.subtitle, i.image_url
  HAVING count(DISTINCT s.user_id) >= 2
  UNION
  SELECT ms.room_id, ms.item_id, i.category, i.title, i.subtitle, i.image_url
    FROM matches ms
    JOIN items i ON i.id = ms.item_id;

-- ---- drop the old key columns ----

ALTER TABLE public.members DROP COLUMN id;

-- members_consent_recorded stays NOT VALID. 27 rows legitimately predate the
-- consent_version column and validating would require fabricating consent for
-- all of them. DROP COLUMN id does not revalidate it.

ALTER TABLE public.swipes DROP CONSTRAINT swipes_pkey;
ALTER TABLE public.swipes DROP COLUMN member_id;
ALTER TABLE public.swipes ADD CONSTRAINT swipes_pkey PRIMARY KEY (user_id, room_id, item_id);

ALTER TABLE public.swipes
  ADD CONSTRAINT swipes_membership_fkey
  FOREIGN KEY (user_id, room_id) REFERENCES public.members (user_id, room_id)
  ON DELETE CASCADE;

-- Serves the room-wide reads in room_matches and the per-room deck filter.
CREATE INDEX IF NOT EXISTS swipes_room_id_idx ON public.swipes (room_id);

-- ---- the two-member cap now has to survive an UPDATE ----
--
-- trg_room_member_limit was BEFORE INSERT only. That is how a member row was
-- moved into an already-full room by hand on 2026-09-09: an UPDATE of room_id
-- walked straight past the cap. Membership rows are something this feature
-- creates more of, so close it.
CREATE OR REPLACE FUNCTION public.enforce_room_member_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  -- An UPDATE that leaves room_id alone needs no re-check: the row is already
  -- counted in that room and the cap was enforced when it landed there.
  IF tg_op = 'UPDATE' AND new.room_id = old.room_id THEN
    RETURN new;
  END IF;

  -- 022's per-room lock (salt 0, 030's registry): without it two concurrent joins both pass the count.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.room_id::text, 0));

  -- In a BEFORE trigger the moving row still belongs to its old room, so this
  -- count excludes it and >= 2 correctly refuses a full target.
  SELECT count(*) INTO v_count FROM members WHERE room_id = new.room_id;
  IF v_count >= 2 THEN
    RAISE EXCEPTION 'room_full';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_member_limit ON public.members;
CREATE TRIGGER trg_room_member_limit
  BEFORE INSERT OR UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_room_member_limit();

COMMIT;
