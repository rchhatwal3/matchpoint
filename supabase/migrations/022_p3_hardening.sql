-- 022_p3_hardening.sql
-- The four remaining P3s from the 2026-07-27 adversarial QA that live in SQL:
-- the blanket rooms UPDATE grant, the unconstrained price_tiers column, the
-- member-cap TOCTOU (plus the view's exact-2 HAVING), and the non-atomic
-- recovery-code regenerate.

-- ---------------------------------------------------------------------------
-- 1. Column-restrict UPDATE on rooms
-- ---------------------------------------------------------------------------
-- 004_grants.sql:12 granted blanket UPDATE, and 002_rls.sql:20-26 explicitly
-- records that as an accepted tradeoff ("RLS cannot restrict WHICH columns an
-- UPDATE touches ... Column-level hardening ... can be added later if needed").
-- This is later. The surface grew since that comment was written: a member (or
-- anything holding their session) can PATCH `code` and invalidate an invite link
-- their partner already shared, set `created_at`, or write junk into the two
-- columns 015/018 added.
--
-- Column GRANTs are the mechanism RLS lacks. The policy `rooms_update_members`
-- stays exactly as it is and still scopes the row; this scopes the columns.
--
-- locations + price_tiers are the complete set the client writes — verified
-- against every `from('rooms')` call in the repo: SessionProvider.tsx:363
-- (`updateLocations`, locations only), :374-377 (`updatePriceTiers`, price_tiers
-- only), and three SELECTs (:125, :298, :329). create_room/join_room write rooms
-- from inside SECURITY DEFINER bodies and are unaffected by grants. service_role
-- holds only SELECT on rooms (012), so the REVOKE below cannot reach the
-- get-restaurants guard.
--
-- A column-level UPDATE grant still requires SELECT on the columns named in the
-- WHERE clause, which authenticated already has on all of rooms (004:12).
REVOKE UPDATE ON public.rooms FROM authenticated;
GRANT UPDATE (locations, price_tiers) ON public.rooms TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Bound rooms.price_tiers to the five real tiers
-- ---------------------------------------------------------------------------
-- 015 added the column with no constraint, so a direct PATCH can store any
-- smallint. Reads then silently drop the out-of-range values (normalizePriceTiers
-- at lib/price-filter.ts:20-23), which makes the stored row and the rendered
-- filter disagree with no error anywhere. `<@` is array containment, so the empty
-- array passes — that is deliberate: `updatePriceTiers([])` is a state the client
-- can currently reach (app/swipe/[category].tsx:41-49) and this constraint is not
-- the place to change product behaviour.
--
-- NOT VALID, same rationale as 017:25-32 and 018:21-29: nothing has ever bounded
-- this column, so a live room may already hold an out-of-range value written
-- before this migration, and a validating ALTER would abort the whole file on the
-- first such row. NOT VALID still enforces on every future INSERT and UPDATE,
-- which is the entire attack path. To validate later, once the offenders are
-- fixed:
--   SELECT id, price_tiers FROM rooms
--    WHERE NOT (price_tiers <@ ARRAY[0,1,2,3,4]::smallint[]);   -- fix these first
--   ALTER TABLE rooms VALIDATE CONSTRAINT rooms_price_tiers_valid;
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_price_tiers_valid;
ALTER TABLE rooms
  ADD CONSTRAINT rooms_price_tiers_valid
  CHECK (price_tiers <@ ARRAY[0,1,2,3,4]::smallint[]) NOT VALID;

-- ---------------------------------------------------------------------------
-- 3. Close the member-cap TOCTOU, and degrade instead of disappearing if it ever
--    lost anyway
-- ---------------------------------------------------------------------------
-- 001_schema.sql:50-58 counted without a lock. Under READ COMMITTED two people
-- joining the same one-member room concurrently both observe count = 1, both pass
-- the check, and the room ends with three members. The advisory lock serialises
-- the count against any other insert for the SAME room_id and is released at
-- transaction end, so it costs nothing on the uncontended path and never needs an
-- explicit unlock (including on rollback).
--
-- CREATE OR REPLACE, not DROP + CREATE: the existing trg_room_member_limit
-- binding on members survives a replace, so the trigger itself is untouched.
-- Everything else about the function is identical to 001 — same name, same
-- SECURITY DEFINER, same `SET search_path = public`, same 'room_full' exception
-- that 016's join_room already collapses into its one generic failure.
CREATE OR REPLACE FUNCTION enforce_room_member_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.room_id::text, 0));
  IF (SELECT count(*) FROM members WHERE room_id = NEW.room_id) >= 2 THEN
    RAISE EXCEPTION 'room_full';
  END IF;
  RETURN NEW;
END;
$$;

-- The lock makes a third member unreachable going forward, but any room that
-- already lost the race is permanently broken today: `= 2` means an item all
-- three members liked counts 3 and yields NO match, so the room's history is
-- silently empty with no error. `>= 2` degrades that to "shows matches" instead
-- of "shows nothing" — for a 2-member room, which is every room the cap allows,
-- the two are identical.
--
-- Re-created with BOTH arms from 021: live rows UNION the erasure snapshot. Same
-- column list in the same order, same `security_invoker = true`, same UNION (not
-- UNION ALL) so a match that is both live and snapshotted renders once. Only the
-- HAVING changed. CREATE OR REPLACE, not DROP + CREATE, so the
-- `GRANT SELECT ON public.room_matches TO authenticated` from 004:15 survives.
CREATE OR REPLACE VIEW room_matches
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
-- 4. Make recovery-code regeneration atomic
-- ---------------------------------------------------------------------------
-- issue-recovery-codes/index.ts:40-43 voids the old set and writes the new one as
-- two independent PostgREST calls with no transaction between them. If the insert
-- fails — transient DB error, timeout, cold-start kill between the calls — the
-- user is left with ZERO codes and their previous set irreversibly void, behind a
-- 500 that says "Try again". For someone who regenerated precisely because they
-- had already lost email access, that is permanent account loss.
--
-- One function body = one transaction, so the delete and the insert commit or
-- roll back together. Nothing in here can leave a user with no codes: the guards
-- below raise before the delete, and any failure in the insert (a NOT NULL
-- violation from a row missing code_hash/salt, a FK violation from an unknown
-- p_user) aborts the function and takes the delete with it.
--
-- p_rows is the exact array the edge function already builds:
-- [{ "user_id": uuid, "code_hash": text, "salt": text }, ...] (index.ts:32-37).
-- user_id is read from p_user rather than from each row, so the set that gets
-- deleted and the set that gets inserted are the same user by construction — a
-- mismatched user_id in the payload cannot orphan the caller's codes.
CREATE OR REPLACE FUNCTION replace_recovery_codes(p_user uuid, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  -- An empty or non-array payload must NOT delete the old set: that is exactly
  -- the "user ends with zero codes" outcome this function exists to prevent.
  -- jsonb_typeof(NULL) is NULL, so a missing argument fails this too.
  IF p_rows IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'rows_required';
  END IF;

  DELETE FROM recovery_codes WHERE user_id = p_user;

  INSERT INTO recovery_codes (user_id, code_hash, salt)
    SELECT p_user, r.code_hash, r.salt
    FROM jsonb_to_recordset(p_rows) AS r(code_hash text, salt text);
END;
$$;

-- service_role ONLY. The edge function runs as service_role; no client role has
-- any business replacing a code set, and recovery_codes is default-deny to
-- anon/authenticated (011:33-37) precisely so that stays true. Same shape as
-- user_id_for_email (011:56-57): REVOKE from public first, because PostgreSQL
-- grants EXECUTE to PUBLIC on every new function by default.
REVOKE ALL ON FUNCTION replace_recovery_codes(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION replace_recovery_codes(uuid, jsonb) TO service_role;

-- MANUAL: apply this migration BEFORE deploying the issue-recovery-codes change
-- that calls the RPC — an undeployed function against a migrated DB is fine (the
-- old two-call path still works), the reverse returns "Could not generate
-- recovery codes" for every regenerate.
