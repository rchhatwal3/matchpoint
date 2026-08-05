-- 026_member_room_id_private.sql
-- The P2 from the 2026-08-03 adversarial QA, reproduced against production:
-- member_room_id() is a membership oracle that any session can call as a
-- PostgREST RPC.
--
-- 002_rls.sql:5-8 creates it in `public` as SECURITY DEFINER with no REVOKE.
-- PostgreSQL grants EXECUTE to PUBLIC on every new function and PostgREST
-- exposes the `public` schema, so `POST /rest/v1/rpc/member_room_id` is a
-- routable endpoint. A fresh anonymous session that had never joined any room
-- called it with another member's id and received that member's room uuid with
-- a 200, while a direct read of `members` for the same id correctly returned
-- `[]`. The RLS on the table is intact; the function simply walks around it,
-- because that is what SECURITY DEFINER is for.
--
-- What it leaks: anyone who has ever seen a member uuid — an ex-partner, or
-- anyone who briefly joined a room — can poll indefinitely to learn whether
-- that person is still in a room, when they move to a different one (the uuid
-- changes), and when they delete their account (`null`). Given two uuids it
-- answers "are these two people partners".
--
-- WHY A REVOKE DOES NOT FIX THIS. The obvious patch is the shape used by
-- user_id_for_email (011:56) and spend_places_lookup (023:158):
-- `REVOKE ALL ON FUNCTION public.member_room_id(uuid) FROM public`. It is
-- useless here. Supabase anonymous sessions carry the `authenticated` role
-- (002:42-43), so the attacker *is* `authenticated`; and an RLS policy
-- expression is evaluated with the privileges of the role running the query,
-- not the table owner, so `authenticated` must keep EXECUTE or all five
-- policies below start failing with "permission denied for function". Revoking
-- from PUBLIC while granting to `authenticated` leaves the RPC exactly as
-- callable as it is today. There is no grant configuration that closes this.
--
-- THE FIX: move the function out of the exposed schema. PostgREST only routes
-- /rest/v1/rpc/ into the schemas it is configured to expose; this project ships
-- the Supabase default (`public, graphql_public` — there is no
-- supabase/config.toml in the repo, the setting lives in Dashboard → Settings →
-- API). A function in `private` therefore has no HTTP route at all, while an
-- RLS policy can still call it by qualified name because policies are evaluated
-- inside the database and never traverse PostgREST. The EXECUTE grant to
-- `authenticated` stops being a grant of anything reachable.
--
-- DO NOT add `private` to the exposed-schema list. That unexposure is the whole
-- fix; adding it back reopens the oracle at the new name.

-- EXPLICIT TRANSACTION, NOT OPTIONAL. This file is applied by pasting into the
-- Supabase SQL editor, which autocommits per statement. Every statement below
-- must be all-or-nothing: a run that stops between the DROP and CREATE of a
-- policy leaves a table with no SELECT policy at all (default-deny — the app
-- breaks), and a run that stops after some policies are repointed but before
-- the final DROP FUNCTION leaves the oracle open while reporting success.
-- 023_places_budget_atomic.sql:183-190 is the same call for the same reason.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. An unexposed home for the helper
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

-- Same body, same volatility, same `SET search_path = public` as 002:5-8 —
-- every SECURITY DEFINER function in this project sets it (001:51, 003:5,40,
-- 011:42,53, 013:17,53, 016:33,83, 019:53,104, 021:111, 022:76,147, 023:103)
-- and a definer function without it is a search-path hijack. `public` is all it
-- needs: the body references only public.members.
--
-- CREATE OR REPLACE for re-runnability. Note that REPLACE *preserves* an
-- existing function's ACL, so the REVOKE below is what makes the privileges
-- deterministic on a second apply, not the CREATE.
CREATE OR REPLACE FUNCTION private.member_room_id(p_member uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT room_id FROM members WHERE id = p_member;
$$;

-- ---------------------------------------------------------------------------
-- 2. Privileges: exactly one role, exactly one privilege
-- ---------------------------------------------------------------------------
-- The REVOKE FROM public is the default-EXECUTE-to-PUBLIC problem that started
-- this. anon and authenticated are additionally revoked BY NAME for the reason
-- spelled out at 023:149-155: Supabase projects commonly carry `ALTER DEFAULT
-- PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated`, and an
-- explicit grant is not removed by a REVOKE FROM PUBLIC. Those default
-- privileges are declared `IN SCHEMA public` and so should not reach `private`
-- at all, but "should not" is not "verified against this database", and a
-- revoke-then-grant is deterministic either way.
REVOKE ALL ON FUNCTION private.member_room_id(uuid) FROM public;
REVOKE ALL ON FUNCTION private.member_room_id(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.member_room_id(uuid) TO authenticated;

-- Schema USAGE. A newly created schema grants PUBLIC nothing, so the REVOKE is
-- belt-and-braces for the case where `private` already existed; the GRANT is
-- load-bearing. EXECUTE on a function is not sufficient on its own — without
-- USAGE on its schema the call fails with 42501 "permission denied for schema
-- private", and because that call sits inside an RLS policy the failure surfaces
-- as every read of rooms/members/swipes/matches erroring out.
--
-- Exactly one role needs it, and the reasoning matters because getting it wrong
-- either breaks the app or hands the oracle to a role that can reach PostgREST.
-- Policy expressions run as the querying role, so the question is: which roles
-- can reach a row protected by one of the five policies in section 3?
--
--   authenticated — YES. This is every client session, Supabase anonymous auth
--     included (002:42-43): the app's own reads of rooms/members/swipes/matches;
--     the Realtime subscriptions at providers/SessionProvider.tsx:203,224,246,
--     since Realtime re-evaluates RLS as the JWT's role before delivering a
--     message and would silently stop delivering otherwise; and the room guard
--     at supabase/functions/get-restaurants/index.ts:82-93, which deliberately
--     reads members and rooms through the *caller* client (anon key + the user's
--     JWT), not service_role — see the comment at index.ts:60-64.
--
--   anon — NO. 004_grants.sql:6 gives it no table privileges at all, so a read
--     of these tables is refused at the GRANT layer before any policy is
--     evaluated. Granting it USAGE would add reachable surface and buy nothing.
--
--   service_role — NO. It bypasses RLS, so these expressions never evaluate for
--     it, and no service_role code path reads these four tables regardless: the
--     only service_role work in the edge functions is `items` (007:10) plus the
--     RPCs spend_places_lookup, replace_recovery_codes and user_id_for_email,
--     none of which sit behind a member_room_id policy. The SELECTs granted in
--     012:10-11 are now vestigial — get-restaurants moved that guard to the
--     caller client. If a future service_role path does read these tables and
--     the RLS bypass is somehow not in effect, the symptom is 42501 "permission
--     denied for schema private" and the fix is these same two lines aimed at
--     service_role. Adding it pre-emptively is not free: service_role reaches
--     PostgREST too, so it is grant surface that the current code does not use.
--
--   the function owner (postgres, whoever applies this file) — implicit; an
--     owner is not checked against its own schema.
REVOKE ALL ON SCHEMA private FROM public;
GRANT USAGE ON SCHEMA private TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Repoint every policy that calls the helper
-- ---------------------------------------------------------------------------
-- Five policies, seven call sites. Each is re-created with its semantics
-- byte-for-byte apart from the schema qualifier: same name, same table, same
-- command, same expression, and no `TO` clause — omitting it means TO PUBLIC,
-- which is what 002 and 021 created and what the grants in 004/012/017/022 are
-- written against. Adding a `TO authenticated` here would look tidier and would
-- silently change who these policies apply to.
--
-- DROP + CREATE, not ALTER: ALTER POLICY cannot be written idempotently and the
-- pair is the shape 017:23 and 023:254-257 already use. It does mean this file
-- overwrites whatever the live definitions are with the ones from the migration
-- files, so run the drift query at the end of this file BEFORE applying.

-- 002_rls.sql:17-18
DROP POLICY IF EXISTS "rooms_select_members" ON public.rooms;
CREATE POLICY "rooms_select_members" ON public.rooms
  FOR SELECT USING (id = private.member_room_id(auth.uid()));

-- 002_rls.sql:27-30. Calls it in BOTH USING and WITH CHECK; both are required.
-- The column-level UPDATE grant from 022:31-32 is what scopes the columns and
-- is untouched here — 022:18-19 says explicitly that the policy "stays exactly
-- as it is and still scopes the row", and it still does.
DROP POLICY IF EXISTS "rooms_update_members" ON public.rooms;
CREATE POLICY "rooms_update_members" ON public.rooms
  FOR UPDATE
  USING (id = private.member_room_id(auth.uid()))
  WITH CHECK (id = private.member_room_id(auth.uid()));

-- 002_rls.sql:33-36. The `id = auth.uid()` arm is load-bearing: it is what keeps
-- a member's own row visible when they have no room.
DROP POLICY IF EXISTS "members_select_same_room" ON public.members;
CREATE POLICY "members_select_same_room" ON public.members
  FOR SELECT USING (
    id = auth.uid() OR room_id = private.member_room_id(auth.uid())
  );

-- 002_rls.sql:49-52. Two calls in one expression. Both sides NULL yields NULL,
-- not true, so a roomless caller still matches nothing — preserved.
DROP POLICY IF EXISTS "swipes_select_same_room" ON public.swipes;
CREATE POLICY "swipes_select_same_room" ON public.swipes
  FOR SELECT USING (
    private.member_room_id(swipes.member_id) = private.member_room_id(auth.uid())
  );

-- 021_erasure_honesty.sql:49-50. Also reached indirectly: the room_matches view
-- (021:74-98) is security_invoker, so its snapshot arm is filtered by this
-- policy and its live arm by swipes_select_same_room and members_select_same_room
-- above.
DROP POLICY IF EXISTS "matches_select_same_room" ON public.matches;
CREATE POLICY "matches_select_same_room" ON public.matches
  FOR SELECT USING (room_id = private.member_room_id(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Remove the exposed original
-- ---------------------------------------------------------------------------
-- NO CASCADE, deliberately and permanently. PostgreSQL refuses to drop a
-- function that any policy still depends on, so this statement is the migration's
-- own completeness check: if the live database carries a policy calling
-- public.member_room_id that section 3 did not repoint, this fails with
-- "cannot drop function ... because other objects depend on it", the whole
-- transaction rolls back, and the human sees exactly which policy was missed.
-- CASCADE would instead delete that policy — turning a missed policy into either
-- a silently open oracle or a table whose rows just became readable to the wrong
-- people. Never add CASCADE to this line.
DROP FUNCTION public.member_room_id(uuid);

COMMIT;

-- ---------------------------------------------------------------------------
-- BEFORE APPLYING: confirm the live policy set matches the one above
-- ---------------------------------------------------------------------------
-- Migration files drift from the database. Run this first; it is the same
-- dependency graph DROP FUNCTION consults, so anything it lists and section 3
-- does not repoint will abort the transaction:
--
--   SELECT c.relnamespace::regnamespace AS schema,
--          c.relname                    AS table_name,
--          p.polname                    AS policy_name,
--          p.polcmd,
--          pg_get_expr(p.polqual,      p.polrelid) AS using_expr,
--          pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expr
--     FROM pg_depend d
--     JOIN pg_policy p ON p.oid = d.objid
--     JOIN pg_class  c ON c.oid = p.polrelid
--    WHERE d.classid    = 'pg_policy'::regclass
--      AND d.refclassid = 'pg_proc'::regclass
--      AND d.refobjid   = 'public.member_room_id(uuid)'::regprocedure
--    ORDER BY 1, 2, 3;
--
-- Expected: exactly the five rows re-created in section 3, with expressions
-- matching them. Any extra row must be added to section 3 first. Any row whose
-- expression differs from section 3 is live drift — reconcile it before
-- applying, because section 3 will overwrite it.
--
-- Non-policy dependents (a view, another function, a generated column) would
-- also block the DROP and are not listed above:
--
--   SELECT d.classid::regclass AS dependent_kind, d.objid, d.deptype
--     FROM pg_depend d
--    WHERE d.refclassid = 'pg_proc'::regclass
--      AND d.refobjid   = 'public.member_room_id(uuid)'::regprocedure
--      AND d.classid   <> 'pg_policy'::regclass;
--
-- ---------------------------------------------------------------------------
-- AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. The RPC must be gone. From any client session:
--      POST /rest/v1/rpc/member_room_id  ->  404 (PGRST202, function not found)
--    Repeat it against /rpc/private.member_room_id and rpc/member_room_id with
--    an `Accept-Profile`/`Content-Profile: private` header; all must 404 or
--    "schema must be one of the following" as long as `private` stays unexposed.
--
-- 2. Privileges are what this file intends:
--      SELECT p.proname, p.pronamespace::regnamespace AS schema, p.proacl
--        FROM pg_proc p WHERE p.proname = 'member_room_id';
--      -- one row, schema `private`, proacl showing only the owner and
--      -- authenticated=X
--      SELECT nspname, nspacl FROM pg_namespace WHERE nspname = 'private';
--
-- 3. The app still works end to end, which is the only real test of section 3:
--    two sessions in one room must still see the room, each other, each other's
--    swipes and their matches, Realtime updates must still arrive, and a session
--    in a different room must still see none of it.
