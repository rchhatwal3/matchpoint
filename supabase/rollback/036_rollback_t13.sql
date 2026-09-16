-- 036_rollback_t13.sql
-- UNDO for 033_memberships_schema.sql + 034_memberships_policies.sql +
-- 035_memberships_rpcs.sql. Restores the one-room-per-person model that was
-- live immediately before 033.
--
-- THIS FILE IS NOT A MIGRATION AND MUST NEVER LIVE IN supabase/migrations.
-- It is deliberately parked in supabase/rollback/ so that nothing which walks
-- the migrations directory — `supabase db push`, a future CI step, or a human
-- pasting "the next file" into the SQL editor — can pick it up and run it by
-- accident. Applying it on top of a database that has NOT had 033-035 applied
-- will fail on the first ALTER (no `user_id` column), which is the correct
-- outcome, but do not rely on that as the safety net. The runbook is
-- docs/T13_ROLLBACK.md; read it before running this.
--
-- WHAT THE PRE-033 STATE WAS, object by object. Several of these objects were
-- redefined more than once between 001 and 032; the definition restored here is
-- in every case the LAST one before 033:
--
--   members.id                    001_schema.sql:13-18       (uuid primary key)
--   members_id_auth_users_fkey    030_p3_hardening_batch.sql:437-443
--   swipes.member_id / swipes_pkey / swipes_member_id_fkey
--                                 001_schema.sql:33-40
--   room_matches                  022_p3_hardening.sql:98-122  (NOT 021's — 022
--                                 relaxed the HAVING from `= 2` to `>= 2`, and
--                                 030:42-45 records that 030 deliberately left
--                                 022's view standing)
--   private.member_room_id(uuid)  026_member_room_id_private.sql:67-85
--   private.member_joined_at(uuid)
--                                 030_p3_hardening_batch.sql:150-163
--   rooms_select_members          026:145-147
--   rooms_update_members          026:153-157
--   members_select_same_room      026:161-165
--   swipes_select_same_room       026:169-172
--   swipes_insert_own             002_rls.sql:55-56   (never redefined after 002)
--   swipes_update_own             002_rls.sql:58-59   (never redefined after 002)
--   matches_select_same_room      030:174-179         (026 repointed it, 030 then
--                                 added the joined_at gate — 030 is the latest)
--   create_room(text,text)        019_age_gate_removal.sql:52-89
--   join_room(text,text,text)     030_p3_hardening_batch.sql:313-366  (030
--                                 re-created 019's body plus the salt-2 advisory
--                                 lock; 030 is the latest)
--   delete_my_data()              021_erasure_honesty.sql:110-165
--   enforce_room_member_limit()   022_p3_hardening.sql:75-84 + BEFORE INSERT
--                                 trigger from 001_schema.sql:61-63
--
-- `members_insert_self` is intentionally absent from that list. 017:23 dropped it
-- and no later migration re-created it — the two SECURITY DEFINER RPCs are the
-- only client write path into members. Do not "restore" it.
--
-- WHAT THIS FILE DOES NOT TOUCH, because 033-035 did not:
--   * every table GRANT, including the column-scoped ones (rooms.locations /
--     price_tiers UPDATE from 022:31-32, matches (room_id, item_id) SELECT from
--     030:203-204). 033:11-16 chose ALTER over drop-and-recreate precisely so
--     those survived; the same choice here means they survive the undo.
--   * members_consent_recorded, still NOT VALID (019:36-39).
--   * idx_swipes_item_id, idx_members_room_id, the realtime publication, and the
--     `matches` table and its data.
--
-- EXPLICIT TRANSACTION, NOT OPTIONAL. Same reason 026:44-50 and 023:183-190 give:
-- this file is applied by pasting into the Supabase SQL editor, which autocommits
-- per statement. A run that stops midway would leave the database in a shape that
-- is neither the old model nor the new one — a members table with no primary key,
-- or tables with RLS enabled and no policies (default-deny, every client read
-- returns nothing, silently). One BEGIN/COMMIT means a failure anywhere leaves
-- the database exactly as it was when the operator pressed Run.
--
-- NO CASCADE ANYWHERE, deliberately and permanently. Every DROP in this file is
-- bare. If some object this file did not anticipate still depends on what is
-- being dropped, PostgreSQL refuses, the whole transaction rolls back, and the
-- operator sees which object it was. CASCADE would instead delete that object —
-- turning an unanticipated dependency into a silently dropped policy (rows
-- readable by the wrong people) or a silently dropped view (taking the
-- `GRANT SELECT ON public.room_matches TO authenticated` from 004:15 with it).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. THE ONE THING THAT MAKES THIS ROLLBACK LOSSY — abort before touching data
-- ---------------------------------------------------------------------------
-- The old model is `members.id = auth.uid()` as the PRIMARY KEY: one person, one
-- membership row, forever. That is not a convention this file can bend, it is
-- the key. If anybody has joined a second room since 033 was applied, there is
-- no correct way to collapse their rows back into one — restoring the key would
-- either fail on the duplicate or, worse, require this file to pick a room and
-- silently throw the other one away along with every swipe in it.
--
-- So it refuses. A rollback that quietly destroys a room somebody is using is
-- worse than no rollback: the operator running this is already in an incident
-- and will not notice a row count that is short by three.
--
-- The check is a single top-level statement by construction. It creates no
-- scratch relation at all — see supabase/migrations/migration-atomicity.test.ts
-- for why a scratch table spread across statements is a live-apply failure and
-- not a style preference: consecutive top-level statements do not always share a
-- backend, so an uncommitted CREATE TABLE in one is gone in the next.
--
-- This also covers swipes_pkey implicitly and is the stronger of the two checks:
-- with exactly one membership per user, every swipe a user owns carries the same
-- room_id, so (user_id, item_id) is already unique and the restored
-- (member_id, item_id) key cannot collide.
DO $$
DECLARE
  v_multi bigint;
BEGIN
  SELECT count(*) INTO v_multi
    FROM (SELECT user_id FROM public.members GROUP BY user_id HAVING count(*) > 1) d;

  IF v_multi > 0 THEN
    RAISE EXCEPTION
      'ROLLBACK ABORTED: % user(s) hold more than one membership row. The pre-033 model keys members on a single id = auth.uid() and cannot represent this, so rolling back now would destroy memberships and their swipes. Decide which room each of these users keeps and remove the others (leave_room, or a direct DELETE), or restore from the pre-change snapshot instead. List them with: SELECT user_id, count(*), array_agg(room_id) FROM public.members GROUP BY user_id HAVING count(*) > 1;',
      v_multi;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Put the old columns back, populated, before anything reads them
-- ---------------------------------------------------------------------------
-- ORDER MATTERS, AND IT IS THE MIRROR IMAGE OF 033's PROBLEM. 033 had to
-- re-point the policies and the view OFF members.id / swipes.member_id before it
-- could drop those columns. Going the other way, the restored policies, the
-- restored view and the restored `private` helpers all REFERENCE those columns,
-- so the columns have to exist first — and the columns 033 added cannot be
-- dropped until the last policy and the view have stopped referencing THEM.
-- Hence the shape of this file: add old columns (1) -> keys and FKs (2) ->
-- helpers (3) -> policies (4) -> view (5) -> only now drop the new columns (6).
--
-- The `private` helpers are the non-obvious half. They are LANGUAGE sql, and
-- PostgreSQL parses a sql function body at CREATE time (check_function_bodies is
-- on by default), so `SELECT room_id FROM members WHERE id = p_member` fails
-- outright with "column id does not exist" if section 3 runs before this one.
-- plpgsql bodies are not checked that way — create_room and friends in section 7
-- would survive being placed anywhere — but they are kept late regardless, so
-- the file reads in dependency order rather than in "what happens to work" order.

ALTER TABLE public.members ADD COLUMN id uuid;

-- Same hazard as the forward migration, and it would bite exactly when this
-- script is needed most. members_consent_recorded is NOT VALID, which exempts
-- the grandfathered rows only at the moment it was added; any UPDATE of such a
-- row re-checks it and raises 23514. The backfill below updates every row.
-- Drop it, backfill, re-add it NOT VALID — same predicate, same unvalidated
-- state, same grandfathering.
ALTER TABLE public.members DROP CONSTRAINT members_consent_recorded;

UPDATE public.members SET id = user_id;
ALTER TABLE public.members ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.members ADD CONSTRAINT members_consent_recorded
  CHECK (consent_version IS NOT NULL AND btrim(consent_version) <> '') NOT VALID;

ALTER TABLE public.swipes ADD COLUMN member_id uuid;
UPDATE public.swipes SET member_id = user_id;
ALTER TABLE public.swipes ALTER COLUMN member_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Keys and foreign keys
-- ---------------------------------------------------------------------------
-- swipes_membership_fkey goes first, for the same reason 033:28-30 dropped
-- swipes_member_id_fkey first: a foreign key pins the unique constraint it
-- points at, so members_pkey cannot be replaced while a composite FK still
-- references (user_id, room_id).
ALTER TABLE public.swipes DROP CONSTRAINT swipes_membership_fkey;

ALTER TABLE public.members DROP CONSTRAINT members_pkey;
ALTER TABLE public.members ADD CONSTRAINT members_pkey PRIMARY KEY (id);

-- Back onto members.id, and STILL NOT VALID. This is not laziness and it is not
-- a copy-paste of 033:41-43 — 030:410-416 is the original argument and it still
-- holds: rows written before the constraint existed may already violate it (that
-- is the finding 030 section 4 closed, in flight), and a validating ALTER would
-- abort on the first orphan and take this whole rollback with it. NOT VALID
-- still enforces on every future INSERT and UPDATE, and the ON DELETE CASCADE
-- action fires for every auth.users delete including rows that predate it.
ALTER TABLE public.members DROP CONSTRAINT members_user_id_auth_users_fkey;
ALTER TABLE public.members
  ADD CONSTRAINT members_id_auth_users_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

-- Verbatim from 030:442-443. A constraint comment is part of the state 030 left
-- behind, and the next person to read pg_constraint deserves the same
-- explanation the pre-033 database carried.
COMMENT ON CONSTRAINT members_id_auth_users_fkey ON public.members IS
  'members.id is auth.uid(); this ties the row to the account and removes it when the account goes. Closes the 2026-07-28 P3 where an access token still valid after deleteUser could write a member row nothing could ever delete. NOT VALID so pre-existing orphans are grandfathered; enforced on all new rows and on every auth.users delete.';

ALTER TABLE public.swipes DROP CONSTRAINT swipes_pkey;
ALTER TABLE public.swipes ADD CONSTRAINT swipes_pkey PRIMARY KEY (member_id, item_id);

-- 001_schema.sql:34 wrote this as an inline REFERENCES, which PostgreSQL names
-- swipes_member_id_fkey — the name 033:30 dropped by. Named explicitly here so
-- the restored catalog matches the old one exactly rather than approximately.
ALTER TABLE public.swipes
  ADD CONSTRAINT swipes_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.members (id) ON DELETE CASCADE;

-- 033:139 added this to serve the room-wide reads in its rewritten view. Nothing
-- in the restored shape uses it — the old view reaches a swipe's room through
-- members, not through swipes.room_id — and it is about to lose its column
-- anyway. Dropped explicitly rather than left to fall out of DROP COLUMN, so
-- the undo is legible in this file instead of implied.
DROP INDEX IF EXISTS public.swipes_room_id_idx;

-- ---------------------------------------------------------------------------
-- 3. The two `private` helpers the old policies call
-- ---------------------------------------------------------------------------
-- 034:112-113 dropped both of these. They are CREATEs here in all but name, so
-- the REVOKEs below are load-bearing rather than belt-and-braces: PostgreSQL
-- grants EXECUTE to PUBLIC on every newly created function, which is the exact
-- default that made the 026 oracle reachable in the first place.
--
-- The grant shape is copied from 026:83-85 and 030:161-163 and the reasoning is
-- theirs: anon and authenticated are revoked BY NAME as well as via PUBLIC,
-- because an explicit grant from `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON
-- FUNCTIONS TO anon, authenticated` is not removed by a REVOKE FROM PUBLIC; and
-- `authenticated` must then be granted EXECUTE back, because an RLS policy
-- expression is evaluated with the privileges of the role running the query, so
-- without it every read of rooms/members/swipes/matches fails with "permission
-- denied for function".
--
-- USAGE on schema `private` is already granted to authenticated by 026:127 and
-- was never revoked by 033-035, so it is not re-granted here.
--
-- `private` stays unexposed. That is the whole of the 026 fix: PostgREST routes
-- only into the schemas the dashboard exposes (`public, graphql_public` on this
-- project), so a function here has no HTTP route and the membership oracle has
-- no front door. DO NOT add `private` to the exposed-schema list.

-- 026:67-69.
CREATE OR REPLACE FUNCTION private.member_room_id(p_member uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT room_id FROM members WHERE id = p_member;
$$;

REVOKE ALL ON FUNCTION private.member_room_id(uuid) FROM public;
REVOKE ALL ON FUNCTION private.member_room_id(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.member_room_id(uuid) TO authenticated;

-- 030:150-153.
CREATE OR REPLACE FUNCTION private.member_joined_at(p_member uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT joined_at FROM members WHERE id = p_member;
$$;

REVOKE ALL ON FUNCTION private.member_joined_at(uuid) FROM public;
REVOKE ALL ON FUNCTION private.member_joined_at(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.member_joined_at(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The seven policies
-- ---------------------------------------------------------------------------
-- DROP + CREATE, not ALTER, and bare DROP rather than DROP ... IF EXISTS. 034
-- created all seven of these unconditionally, so if one is missing the live
-- database is not the database this file was written against — and the right
-- response to that is a loud abort with the whole transaction rolled back, not a
-- silent skip that leaves a table RLS-enabled with one policy short (which is
-- default-deny for that command, i.e. the app half-broken with no error
-- anywhere).
--
-- No `TO` clause on any of them, exactly as 002, 021, 026 and 030 wrote them.
-- Omitting it means TO PUBLIC. 026:132-137 warns explicitly against "tidying"
-- this into `TO authenticated` — it looks neater and silently changes who the
-- policy applies to.

-- 026:145-147.
DROP POLICY rooms_select_members ON public.rooms;
CREATE POLICY "rooms_select_members" ON public.rooms
  FOR SELECT USING (id = private.member_room_id(auth.uid()));

-- 026:153-157. The helper is called in BOTH arms; both are required. The
-- column-level UPDATE grant from 022:31-32 is what scopes WHICH columns an
-- update may touch and is untouched by this file — the policy only ever scoped
-- the row.
DROP POLICY rooms_update_members ON public.rooms;
CREATE POLICY "rooms_update_members" ON public.rooms
  FOR UPDATE
  USING (id = private.member_room_id(auth.uid()))
  WITH CHECK (id = private.member_room_id(auth.uid()));

-- 026:161-165. The `id = auth.uid()` arm is load-bearing and is not redundant
-- with the room arm: it is what keeps a member's own row visible to them when
-- member_room_id returns NULL.
DROP POLICY members_select_same_room ON public.members;
CREATE POLICY "members_select_same_room" ON public.members
  FOR SELECT USING (
    id = auth.uid() OR room_id = private.member_room_id(auth.uid())
  );

-- 026:169-172. Two resolutions of two different rows in one expression — the
-- shape 033:19-24 replaced, restored as it was. Both sides NULL yields NULL and
-- not true, so a caller with no member row still matches nothing.
DROP POLICY swipes_select_same_room ON public.swipes;
CREATE POLICY "swipes_select_same_room" ON public.swipes
  FOR SELECT USING (
    private.member_room_id(swipes.member_id) = private.member_room_id(auth.uid())
  );

-- 002:55-56. Never redefined between 002 and 033.
DROP POLICY swipes_insert_own ON public.swipes;
CREATE POLICY "swipes_insert_own" ON public.swipes
  FOR INSERT WITH CHECK (member_id = auth.uid());

-- 002:58-59. Never redefined between 002 and 033.
DROP POLICY swipes_update_own ON public.swipes;
CREATE POLICY "swipes_update_own" ON public.swipes
  FOR UPDATE USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());

-- 030:174-179 — the LATEST of the three versions of this policy. 021:49-50
-- created it, 026:179-181 repointed it at the `private` helper, and 030 added the
-- `matched_at >= joined_at` conjunct. That conjunct is 021's erasure control and
-- must not be dropped on the way back: without it, somebody who joins a room
-- after a departing member's matches were snapshotted can read them.
DROP POLICY matches_select_same_room ON public.matches;
CREATE POLICY "matches_select_same_room" ON public.matches
  FOR SELECT USING (
    room_id = private.member_room_id(auth.uid())
    AND matched_at >= private.member_joined_at(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. room_matches, back to its 022 definition
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE, never DROP + CREATE. Replacing preserves the
-- `GRANT SELECT ON public.room_matches TO authenticated` from 004:15; dropping
-- would take it silently and the matches screen would start returning
-- permission-denied for every user. 021:64-67, 022:124-127 and 033:103-107 all
-- make the same point about the same grant.
--
-- REPLACE requires the output column list to match the existing view exactly —
-- same names, same types, same order. 033's view emits
-- (room_id, item_id, category, title, subtitle, image_url) and so does this one;
-- s.room_id and m.room_id are both uuid, so the replace is legal.
--
-- This is 022's HAVING `>= 2`, not 021's `= 2`. 022:124-131 explains the
-- difference: a room that lost the pre-022 member-cap race and holds three
-- members yields NO match under `= 2`, so its entire history renders as empty
-- with no error. For a two-member room, which is every room the cap allows, the
-- two are identical. 030:42-45 records that 030 deliberately did not touch this
-- view, so 022 is the last word on it before 033.
--
-- security_invoker stays true: both arms must be filtered as the caller, the
-- live arm through swipes_select_same_room and members_select_same_room and the
-- snapshot arm through matches_select_same_room. UNION and not UNION ALL, so a
-- match that is both live and snapshotted renders once (021:68-72).
--
-- This statement is also what un-pins swipes.room_id and swipes.user_id. Section
-- 6 cannot run before it.
--
-- ON SCHEMA QUALIFICATION, here and in sections 8 and 9. The source migrations
-- wrote these object names bare and relied on the SQL editor's search_path. For
-- the THING BEING CREATED that is a silent-failure risk in an emergency: if the
-- session's search_path is not `public`, a bare `CREATE OR REPLACE` creates a
-- second object somewhere else instead of replacing the real one, PostgREST
-- keeps routing to the 035 version, and the rollback reports success while
-- having changed nothing. So every target below is qualified. Function and view
-- BODIES are left exactly as the source migrations wrote them — a body that
-- cannot resolve fails loudly (the view here at creation, the plpgsql functions
-- at call time, and each of those carries its own `SET search_path` anyway).
CREATE OR REPLACE VIEW public.room_matches
WITH (security_invoker = true) AS
  (SELECT
    m.room_id,
    s.item_id,
    i.category,
    i.title,
    i.subtitle,
    i.image_url
  FROM swipes s
  JOIN members m ON m.id = s.member_id
  JOIN items i ON i.id = s.item_id
  WHERE s.liked = true
  GROUP BY m.room_id, s.item_id, i.category, i.title, i.subtitle, i.image_url
  HAVING count(DISTINCT s.member_id) >= 2)
  UNION
  (SELECT
    ms.room_id,
    ms.item_id,
    i.category,
    i.title,
    i.subtitle,
    i.image_url
  FROM matches ms
  JOIN items i ON i.id = ms.item_id);

-- ---------------------------------------------------------------------------
-- 6. Now, and only now, drop the columns 033 added
-- ---------------------------------------------------------------------------
-- Everything PostgreSQL tracks as a dependency on these columns is gone:
-- sections 2 dropped the constraints and the index, section 4 replaced the seven
-- policies, section 5 replaced the view. If any of those four DROP COLUMNs fails
-- with "cannot drop column ... because other objects depend on it", something
-- exists in the live database that this file did not know about — read the
-- object it names, do not reach for CASCADE.
--
-- Function bodies are NOT dependencies: private.is_room_member still names
-- members.user_id and will happily survive these drops as a function that errors
-- when called. That is why section 7 drops it explicitly rather than assuming
-- anything here reaches it.
ALTER TABLE public.members DROP COLUMN user_id;

ALTER TABLE public.swipes DROP COLUMN user_id;
ALTER TABLE public.swipes DROP COLUMN room_id;

-- ---------------------------------------------------------------------------
-- 7. Remove the two-argument helpers
-- ---------------------------------------------------------------------------
-- Bare DROP, no CASCADE — 026:186-194's argument applies unchanged. PostgreSQL
-- refuses to drop a function a policy still depends on, so these two statements
-- are this file's own completeness check on section 4: if the live database
-- carries a policy calling either helper that section 4 did not replace, this
-- fails, the transaction rolls back, and the operator is told exactly which
-- policy was missed. CASCADE would delete that policy instead, turning a missed
-- policy into a table whose rows just became readable by the wrong people.
--
-- The one-argument private.member_joined_at restored in section 3 is a different
-- function; the argument list disambiguates and it is not affected.
DROP FUNCTION private.is_room_member(uuid, uuid);
DROP FUNCTION private.member_joined_at(uuid, uuid);

-- ---------------------------------------------------------------------------
-- 8. The RPCs
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE throughout, which preserves each function's existing ACL
-- (026:64-66) — so the `GRANT EXECUTE ... TO authenticated` from 019:159-160 and
-- 021:167 survives and is deliberately not restated. Restating it would be
-- harmless; leaving the grants where the migrations put them is how this repo
-- has always handled a replace.

-- create_room: 019:52-89 verbatim. The only difference from 035's version is the
-- members INSERT column list (id, not user_id) and the absence of the 20-room
-- ceiling, which has no meaning in a model where one room is the maximum.
--
-- THE CODE GENERATION IS UNTOUCHED AND MUST STAY THAT WAY. The alphabet, the
-- gen_random_bytes draw and `SET search_path = public, extensions` are 016's
-- invite-code hardening: 32 unambiguous symbols with I, O, 0 and 1 removed,
-- drawn uniformly because 256 is an exact multiple of 32. Dropping `extensions`
-- from the search_path breaks code minting outright — gen_random_bytes lives in
-- pgcrypto, which 016 installed there.
CREATE OR REPLACE FUNCTION public.create_room(p_name text, p_policy_version text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
  i int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  LOOP
    v_code := '';
    v_bytes := gen_random_bytes(6);
    FOR i IN 1..6 LOOP
      -- 256 is an exact multiple of the 32-symbol alphabet, so `byte % 32` is
      -- a uniform draw — no modulo bias to correct for.
      v_code := v_code || substr(v_chars, (get_byte(v_bytes, i - 1) % 32) + 1, 1);
    END LOOP;
    BEGIN
      INSERT INTO rooms (code) VALUES (v_code);
      EXIT;  -- inserted cleanly; code is unique
    EXCEPTION WHEN unique_violation THEN
      -- collision, loop and try another code
    END;
  END LOOP;

  INSERT INTO members (id, room_id, display_name, consent_version, consented_at)
    SELECT v_uid, r.id, p_name, p_policy_version, now() FROM rooms r WHERE r.code = v_code;

  RETURN v_code;
END;
$$;

-- join_room: 030:313-366 verbatim — NOT 019:103-151. 030 re-created 019's body
-- and added the salt-2 per-caller advisory lock that closes the throttle TOCTOU,
-- so 030 is the definition that was live before 033. Restoring 019's body
-- instead would silently re-open that finding.
--
-- THE unique_violation HANDLER COMES BACK, and it is the whole 2026-09-09
-- defect. Under the restored members_pkey a second room is a primary-key
-- collision, and this handler is what turns that collision into the same
-- indistinguishable NULL as an unknown code — which the app renders as "invalid
-- code". That is not a bug in this file, it is the behaviour of the model being
-- restored: without the handler the collision surfaces as a raw 500 instead.
-- If this rollback is being run because T13 went wrong, the one-room limit and
-- its confusing error message are coming back together. That is the point.
--
-- Advisory lock salt registry (030:280-286): salt 0 = per-room member cap,
-- keyed on room_id; salt 1 = global Places budget, constant key; salt 2 = this,
-- per-caller join throttle, keyed on uid. Lock ordering is uid-then-room and a
-- uid lock is never contended across callers, so there is no cycle against the
-- member-cap lock in section 9.
CREATE OR REPLACE FUNCTION public.join_room(p_code text, p_name text, p_policy_version text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_room_id uuid;
  v_count int;
  v_fails int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Serialises this caller's count-check-record sequence against their own
  -- concurrent calls. Released at transaction end, so it needs no explicit
  -- unlock and none on the rollback that the raise below causes either.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 2));

  SELECT count(*) INTO v_fails FROM join_attempts
    WHERE uid = v_uid AND attempted_at > now() - interval '1 hour';
  IF v_fails >= 10 THEN
    -- Safe to RAISE: this branch records nothing, so the rollback costs nothing.
    -- It reveals only the caller's own history, never whether a code exists.
    RAISE EXCEPTION 'too_many_attempts';
  END IF;

  SELECT id INTO v_room_id FROM rooms WHERE code = v_code;

  -- Already in this room: no-op, return it.
  IF v_room_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM members WHERE id = v_uid AND room_id = v_room_id) THEN
    RETURN v_room_id;
  END IF;

  IF v_room_id IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM members WHERE room_id = v_room_id;
    IF v_count < 2 THEN
      BEGIN
        INSERT INTO members (id, room_id, display_name, consent_version, consented_at)
          VALUES (v_uid, v_room_id, p_name, p_policy_version, now());
        RETURN v_room_id;
      EXCEPTION WHEN raise_exception OR unique_violation THEN
        -- Lost the race for the second seat: trg_room_member_limit (001) raises
        -- 'room_full' here. Fall through so that race is not an oracle either.
        NULL;
      END;
    END IF;
  END IF;

  DELETE FROM join_attempts WHERE attempted_at < now() - interval '1 day';
  INSERT INTO join_attempts (uid) VALUES (v_uid);
  RETURN NULL;
END;
$$;

-- delete_my_data: 021:110-165 verbatim. Single-room again — it resolves "the"
-- caller's room, snapshots that room's matches before the member delete cascades
-- the swipes, and drops the room only if it emptied. The recovery half stays
-- unconditional, which is the 021 fix for 014's early return: an upgraded user
-- with no room must still have their recovery codes and redeem log erased.
CREATE OR REPLACE FUNCTION public.delete_my_data() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room_id uuid;
  v_remaining int;
  v_email text;
BEGIN
  -- Same opening guard as create_room/join_room (019:61,112). PostgREST always
  -- has a session here, so this is a backstop against a NULL uid silently
  -- matching nothing.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT room_id INTO v_room_id FROM members WHERE id = auth.uid();

  -- The room half is conditional; the recovery half below is NOT. 014 returned
  -- here when v_room_id was NULL, which meant an anonymous user who upgraded,
  -- generated recovery codes, then left their room erased nothing at all.
  IF v_room_id IS NOT NULL THEN
    -- Snapshot BEFORE the delete, while the live rows still exist.
    -- Why this sees every match in the room: room_matches is security_invoker,
    -- but inside a SECURITY DEFINER function the effective user is the function
    -- owner, who owns the underlying tables and is therefore not RLS-filtered.
    -- The `WHERE room_id = v_room_id` clause is what scopes this to the caller's
    -- own room — it is load-bearing, not an optimisation.
    -- ON CONFLICT DO NOTHING makes a repeat erasure (or a partner erasing later)
    -- a no-op on rows already snapshotted.
    INSERT INTO matches (room_id, item_id)
      SELECT room_id, item_id FROM room_matches WHERE room_id = v_room_id
      ON CONFLICT DO NOTHING;

    DELETE FROM members WHERE id = auth.uid(); -- cascades swipes (FK ON DELETE CASCADE)
    SELECT count(*) INTO v_remaining FROM members WHERE room_id = v_room_id;
    IF v_remaining = 0 THEN
      DELETE FROM rooms WHERE id = v_room_id; -- cascades any remnants, snapshot included
    END IF;
  END IF;

  -- Salted hashes, but still a personal-data linkage to this user id.
  DELETE FROM recovery_codes WHERE user_id = auth.uid();

  -- recovery_redeem_attempts is keyed by email, not user_id, so it has to be
  -- resolved through auth.users (the same reachability problem 011:52 solved for
  -- the redeem function). Anonymous users have no email and no attempts row, so
  -- NULL simply skips this. lower() because redeem-recovery-code normalises with
  -- trim().toLowerCase() before writing (redeem-recovery-code/index.ts:28).
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NOT NULL THEN
    DELETE FROM recovery_redeem_attempts WHERE email = lower(v_email);
  END IF;
END;
$$;

-- leave_room has no pre-033 counterpart. 035:21-23 is explicit that its absence
-- is why the 2026-09-09 situation could not be fixed from inside the app, and
-- dropping it takes that exit away again — which is correct, because in the
-- restored model leaving your only room and deleting your account are the same
-- operation and delete_my_data already is it.
--
-- Bare DROP. The GRANT EXECUTE from 035:202 goes with the function. Check that
-- the deployed client is not still calling it before running this file: a
-- PostgREST call to a dropped RPC is a 404/PGRST202, not a graceful no-op.
DROP FUNCTION public.leave_room(uuid);

-- ---------------------------------------------------------------------------
-- 9. The member cap, back to BEFORE INSERT only
-- ---------------------------------------------------------------------------
-- 022:75-84 verbatim, and the 001:61-63 trigger binding. 033:141-146 widened
-- this to BEFORE INSERT OR UPDATE because a hand-written UPDATE of room_id had
-- walked straight past the cap; narrowing it back re-opens that hole.
--
-- THAT IS A DELIBERATE, DOCUMENTED REGRESSION AND IT IS THE POINT OF A ROLLBACK:
-- the pre-033 state is what this file restores, not the pre-033 state plus the
-- improvements 033 happened to bundle. Leaving the wider trigger behind would
-- also be wrong in a subtler way — 033's function body branches on `tg_op` and
-- `old.room_id`, and `old` is not bound in an INSERT-only trigger, so a
-- half-restored pairing is a function that errors on the first join. Restore
-- both halves or neither.
--
-- If the operator wants the UPDATE arm kept after the rollback, that is a
-- separate, deliberate follow-up change — not something to leave half-applied
-- here.
--
-- CREATE OR REPLACE rather than DROP + CREATE for the function: the existing
-- trg_room_member_limit binding survives a replace. The trigger itself is then
-- re-created below precisely because its event list is what changed.
CREATE OR REPLACE FUNCTION public.enforce_room_member_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.room_id::text, 0));
  IF (SELECT count(*) FROM members WHERE room_id = NEW.room_id) >= 2 THEN
    RAISE EXCEPTION 'room_full';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_member_limit ON public.members;
CREATE TRIGGER trg_room_member_limit
  BEFORE INSERT ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_room_member_limit();

COMMIT;

-- ---------------------------------------------------------------------------
-- AFTER RUNNING THIS FILE
-- ---------------------------------------------------------------------------
-- The verification queries, the expected row counts and the client-deploy
-- coupling are all in docs/T13_ROLLBACK.md. The short version: the database is
-- now the pre-033 shape, and the currently deployed web client must be the
-- PRE-T13 build, because the post-T13 build reads members.user_id and
-- swipes.room_id, neither of which exists any more.
