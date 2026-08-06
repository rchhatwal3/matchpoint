-- 030_p3_hardening_batch.sql
-- Four P3s from the 2026-07-28 security review, batched because all four are
-- schema-only and none of them needs a client or edge-function change:
--
--   1. The erasure snapshot is visible to a later room member. `matches` rows
--      survive the departing member and the snapshot arm of `room_matches`
--      returns them for the room unconditionally, so a stranger the surviving
--      partner invites afterwards reads the erased user's mutual matches —
--      permanently, after that user exercised erasure.
--   2. `matches.matched_at` discloses when the other member erased. The
--      whole-table GRANT SELECT from 021:56 makes it directly readable and the
--      snapshot is written at the instant of erasure, so the column IS the
--      departure timestamp — which contradicts 021:29-32 ("`matched_at` is when
--      the snapshot was taken ... so it says nothing about the departing
--      member's activity". It says exactly one thing: when they left).
--   3. `join_room`'s throttle is a TOCTOU. Concurrent calls all read the same
--      pre-burst count, so the enforced bound is "10 per hour plus whatever is
--      in flight" rather than the 10 that 016:79-81 documents.
--   4. A deleted user's token can still write. `members.id` has no FK to
--      auth.users and an access token stays signature-valid for up to an hour
--      after deleteUser, so a retained token can create rows keyed to a uid that
--      no longer exists — and nothing can ever remove them, because every
--      erasure path is scoped by auth.uid().
--
-- ---------------------------------------------------------------------------
-- ORDERING
-- ---------------------------------------------------------------------------
-- Apply AFTER 021 (creates `matches` and its policy), 022 (the `room_matches`
-- HAVING `>= 2`), 019 + 020 (the 3-argument join_room this file replaces; the
-- 4-argument overload is gone) and 026 (moved the membership helper to the
-- unexposed `private` schema, granted `authenticated` USAGE on it, and repointed
-- the matches policy). Section 1 calls `private.member_room_id` and adds a
-- second function beside it; both facts make 026 a hard prerequisite.
--
-- There is NO deploy coupling in either direction — this migration is safe to
-- apply at any time relative to the app. Nothing in the repo reads `matches`
-- directly and nothing reads `matched_at`: the only match read in the client is
-- `room_matches` at providers/SessionProvider.tsx:445, whose shape, column order
-- and `security_invoker` are untouched here. `matches` is not in the
-- supabase_realtime publication (005, 006), so no subscription is affected.
--
-- THIS FILE DOES NOT RE-CREATE `room_matches`. That is deliberate: the fix for
-- finding 1 lives in the RLS policy instead (see section 1 for why it has to),
-- so the view 022:98-122 left behind — both arms, same column order, HAVING
-- `>= 2`, `security_invoker = true` — is preserved by not being touched.
--
-- ---------------------------------------------------------------------------
-- GRANTS THIS FILE SUPERSEDES — do not re-run the earlier file on its own
-- ---------------------------------------------------------------------------
-- Section 2 replaces the table-level `GRANT SELECT ON public.matches TO
-- authenticated` from 021_erasure_honesty.sql:56 with a column-scoped grant.
-- Re-running 021 afterwards silently restores the whole-table grant and reopens
-- finding 2 — the same trap 004_grants.sql:12 sets for 022's column-restricted
-- UPDATE on rooms, which this project has now been bitten by three times. If you
-- ever need to re-run 021, re-run THIS file straight after it.
--
-- ---------------------------------------------------------------------------
-- BEFORE APPLYING
-- ---------------------------------------------------------------------------
-- 1. No member row may have a NULL joined_at. The gate in section 1 is
--    fail-closed (NULL <= anything is NULL, not true), so a member with a NULL
--    joined_at would silently stop seeing the snapshot — which is the exact harm
--    021 exists to prevent. The column is `timestamptz DEFAULT now()` with no
--    NOT NULL (001:17) and neither create_room nor join_room writes it
--    explicitly, so this should be zero:
--      SELECT count(*) FROM members WHERE joined_at IS NULL;   -- expect 0
--    If it is not, fix those rows (their true join time is unrecoverable; the
--    room's creation time is the closest honest stand-in) before applying:
--      UPDATE members m SET joined_at = r.created_at
--        FROM rooms r WHERE r.id = m.room_id AND m.joined_at IS NULL;
--
-- 2. Section 4 needs REFERENCES on auth.users, which the `postgres` role in the
--    SQL editor has and a lesser role does not. If it fails with
--    "permission denied for table users", sections 1-3 have already committed in
--    their own transaction and are unaffected — that is why section 4 has a
--    transaction of its own.
--
-- 3. Know what section 4 changes about deleting a user OUT OF BAND. See the
--    risk list at the end of this file before you touch Dashboard →
--    Authentication → Users again.

-- ===========================================================================
-- Sections 1 + 2 — one transaction, not optional
-- ===========================================================================
-- The SQL editor autocommits per statement. Between the DROP POLICY and the
-- CREATE POLICY below, `matches` has RLS enabled and zero policies, which is
-- default-deny: every read of the snapshot — and therefore the snapshot arm of
-- room_matches for every user — returns nothing, silently. Between the REVOKE
-- and the GRANT, authenticated has no privilege on `matches` at all and the view
-- errors outright under security_invoker. Both windows are short and both are
-- indistinguishable from "the fix broke the app" if the run stops in the middle.
-- 026:44-50 and 023:183-190 declare a transaction for the same reason.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Gate the erasure snapshot on the reader having been in the room when it
--    was taken
-- ---------------------------------------------------------------------------
-- The review's fix is `members.joined_at <= matches.matched_at`. Where that
-- predicate goes is the whole engineering content of this section, and it is NOT
-- the view, for two independent reasons:
--
--   a. THE VIEW IS NOT THE ONLY READ PATH. 021:56 grants authenticated SELECT on
--      `matches` itself, so a new member who is refused by the view can simply
--      `GET /rest/v1/matches?room_id=eq.<room>` and read the same (room_id,
--      item_id) pairs — which is the entire disclosure. A gate in the view would
--      be cosmetic. The RLS policy is the one place both paths pass through.
--   b. IT WOULD UNDO SECTION 2. Under `security_invoker = true` the caller needs
--      column privileges on everything the VIEW BODY references. Putting
--      `ms.matched_at` in the view's WHERE clause would force `matched_at` into
--      the column grant below, and the two fixes would cancel out. A policy
--      expression is not subject to the querying role's column privileges — it
--      is the table owner's predicate, evaluated by the system — so the gate can
--      read a column the reader cannot. (If that turns out to be wrong on this
--      server, the symptom is unmissable: every read of matches/room_matches
--      returns 42501 "permission denied for column matched_at" and the fallback
--      is one line — add matched_at back to the section 2 grant, which restores
--      today's behaviour for finding 2 while keeping finding 1 closed. Probe 2
--      below catches it in one request.)
--
-- WHAT THE GATE MEANS: you see a snapshot row only if you were already in the
-- room at the moment it was written. It never grants anything new — a snapshot
-- is written from `room_matches`, so every row in it was already visible to
-- every member present at that instant — and it withholds exactly the case in
-- the finding: someone who arrived afterwards.
--
-- Worked through the sequences that matter:
--   * A and B in a room, A erases at T1. B joined before T1, so B keeps the
--     whole history — the promise at app/settings.tsx:101 and the published
--     policy (lib/legal/content/privacy.ts:113) still holds, which is the
--     property 021 was written to restore and the one this file must not break.
--   * C joins at T2 > T1. C sees nothing from A's snapshot, through the view or
--     through a direct read. That is the finding, closed.
--   * C then erases at T3. delete_my_data() re-snapshots from room_matches, but
--     it runs SECURITY DEFINER as the table owner, who is not RLS-filtered, so
--     it still sees and re-inserts every row (021:130-140). ON CONFLICT DO
--     NOTHING leaves the T1 rows at matched_at = T1 — load-bearing: if a
--     re-snapshot ever refreshed matched_at, every later joiner would inherit
--     the older member's matches and this gate would leak by design.
--   * The last member erases: the room goes, and the snapshot goes with it via
--     the room FK cascade (021:34-35). Unchanged.
--
-- The helper is a SECURITY DEFINER function in `private` rather than an EXISTS
-- subquery over `members` inside the policy, for the reasons 002:1-8 and 026
-- already establish: a policy that subqueries `members` is evaluated with the
-- querying role's privileges and under members' own RLS, which is the recursion
-- and grant-coupling this project spent two migrations getting away from. Same
-- body shape, same STABLE, same `SET search_path = public`, same unexposed
-- schema — so PostgREST has no route to it and it is not a new HTTP oracle.
CREATE OR REPLACE FUNCTION private.member_joined_at(p_member uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT joined_at FROM members WHERE id = p_member;
$$;

-- Same privilege shape as private.member_room_id (026:83-85), for the same
-- reasons: CREATE OR REPLACE preserves an existing ACL, so the REVOKEs are what
-- make a second apply deterministic; anon and authenticated are revoked BY NAME
-- because an explicit grant from `ALTER DEFAULT PRIVILEGES` is not removed by a
-- REVOKE FROM PUBLIC. USAGE on schema `private` is already granted to
-- authenticated by 026:127 and is not re-granted here.
REVOKE ALL ON FUNCTION private.member_joined_at(uuid) FROM public;
REVOKE ALL ON FUNCTION private.member_joined_at(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.member_joined_at(uuid) TO authenticated;

-- The policy, re-created with the gate added and NOTHING else changed from the
-- version 026:179-181 left behind: same name, same table, same command, same
-- `private.` qualifier, and no `TO` clause — omitting it means TO PUBLIC, which
-- is what 021 created and what 026:132-137 warns explicitly against "tidying"
-- into `TO authenticated`.
--
-- Both conjuncts are NULL for a caller with no member row — including the user
-- who has just erased — and NULL is not true, so a roomless caller still matches
-- nothing. Fail-closed in every direction.
DROP POLICY IF EXISTS "matches_select_same_room" ON public.matches;
CREATE POLICY "matches_select_same_room" ON public.matches
  FOR SELECT USING (
    room_id = private.member_room_id(auth.uid())
    AND matched_at >= private.member_joined_at(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. Stop handing out the erasure timestamp
-- ---------------------------------------------------------------------------
-- 021:56 granted SELECT on the whole table. `matched_at` is written by
-- delete_my_data() at the instant of erasure, so for the surviving partner the
-- column answers "when exactly did my partner delete their account" to the
-- microsecond, and PostgREST will happily sort and filter on it. 021's own
-- comment (021:21-32) states that the snapshot deliberately carries nothing
-- about the departing member; this closes the gap between that claim and the
-- grant underneath it.
--
-- Column-scoped, not a REVOKE of everything: `room_matches` is
-- `security_invoker = true`, so the reader's own privileges are what the view is
-- checked against, and its snapshot arm (022:114-122) selects exactly
-- ms.room_id and ms.item_id. Those two columns and no more keep the view — and
-- therefore the client — working unchanged.
--
-- The REVOKE is required before the GRANT: a table-level grant is not narrowed
-- by adding column grants beside it. Nothing else loses anything — 021 granted
-- SELECT to authenticated only, service_role was never granted anything on this
-- table, and delete_my_data() writes it from inside a SECURITY DEFINER body,
-- which needs no grant at all.
REVOKE SELECT ON public.matches FROM authenticated;
GRANT SELECT (room_id, item_id) ON public.matches TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- PROBE — finding 1 (three sessions: A, B, then C). Each step is what a human
-- runs; the "before 030" line is what the same step does on today's database.
-- ---------------------------------------------------------------------------
--   1. Session A: POST /rest/v1/rpc/create_room
--        {"p_name":"A","p_policy_version":"2026-07-27"}          -> "<CODE>"
--      Session B: POST /rest/v1/rpc/join_room
--        {"p_code":"<CODE>","p_name":"B","p_policy_version":"2026-07-27"}
--      Both A and B like the same item (two PATCH/POSTs to /rest/v1/swipes, or
--      one right-swipe each in the app), then confirm the live match exists:
--        GET /rest/v1/room_matches?room_id=eq.<ROOM>   (B's JWT)   -> 1 row
--   2. Session A erases:  POST /rest/v1/rpc/delete_my_data  (A's JWT) -> 204
--      In the SQL editor:
--        SELECT room_id, item_id, matched_at FROM matches WHERE room_id = '<ROOM>';
--        -- 1 row; matched_at is the instant of step 2
--   3. B must still see it (B.joined_at <= matched_at):
--        GET /rest/v1/room_matches?room_id=eq.<ROOM>   (B's JWT)   -> 1 row
--      This is the regression check. If it is empty, 021 has been undone and the
--      surviving partner has lost their history — stop and revert.
--   4. Session C joins the now one-member room:
--        POST /rest/v1/rpc/join_room
--          {"p_code":"<CODE>","p_name":"C","p_policy_version":"2026-07-27"}
--        GET /rest/v1/room_matches?room_id=eq.<ROOM>   (C's JWT)   -> []
--        GET /rest/v1/matches?select=room_id,item_id&room_id=eq.<ROOM>
--                                                     (C's JWT)   -> []
--      Before 030 BOTH return the snapshot row. The second one is why the gate
--      is in the policy and not in the view.
--   5. Clean up: delete_my_data() as B, then as C (the last one takes the room
--      and the snapshot with it).
--
-- PROBE — finding 2 (any session that is a room member; B above will do)
-- ---------------------------------------------------------------------------
--   GET /rest/v1/matches?select=room_id,item_id   (B's JWT)
--     -> 200. Still readable, which is what keeps room_matches working.
--   GET /rest/v1/matches?select=matched_at        (B's JWT)
--     -> 403, code 42501, "permission denied for column matched_at"
--   GET /rest/v1/matches?select=*                 (B's JWT)          -> same 42501
--   GET /rest/v1/matches?select=room_id&matched_at=lt.2030-01-01     -> same 42501
--     (the filter counts as a reference to the column — the timestamp cannot be
--      inferred by binary search either)
--   GET /rest/v1/room_matches?room_id=eq.<ROOM>   (B's JWT)
--     -> unchanged, 200, same rows and same columns as before 030
--   In the SQL editor:
--     SELECT grantee, column_name, privilege_type FROM information_schema.column_privileges
--      WHERE table_name = 'matches' AND grantee = 'authenticated';
--     -- exactly two rows: room_id/SELECT and item_id/SELECT
--     SELECT grantee, privilege_type FROM information_schema.table_privileges
--      WHERE table_name = 'matches' AND grantee = 'authenticated';
--     -- empty: no table-wide privilege survives
--
--   NOTE: if step 1 of this probe (`select=room_id,item_id`) returns 42501 for
--   `matched_at`, the policy in section 1 IS being column-checked on this server
--   (see 1b above). Fallback, and only then:
--     GRANT SELECT (matched_at) ON public.matches TO authenticated;
--   That reopens finding 2 and leaves finding 1 closed. File it, don't leave it
--   undocumented.

-- ===========================================================================
-- 3. Close the join_room throttle TOCTOU
-- ===========================================================================
-- 016:95-101 counts the caller's failures in the last hour, compares, and only
-- much later writes the row that increments that count (016:127). Under READ
-- COMMITTED, N concurrent calls from one session all read the same pre-burst
-- count, all pass, and all record a failure afterwards — the enforced bound is
-- "10 per hour plus whatever is in flight", not the 10 the comment claims.
--
-- This does NOT reopen the brute-force finding: even an unbounded burst is
-- attacking a 1.07e9 space with the anonymous sign-in limit above it. It is
-- fixed because a control that does not enforce the number it documents is worse
-- than no control — the next person to reason about the invite-code surface will
-- take 016's "10 guesses per signup" as given.
--
-- ADVISORY LOCK SALT REGISTRY — extend this list when you add a namespace, and
-- never reuse a salt for a different key space (the 64-bit lock space is shared
-- process-wide, so two namespaces that collide serialise each other for no
-- reason and can deadlock in ways neither author can see):
--   0  per-room member cap        022_p3_hardening.sql:78   key = room_id
--   1  global Places budget       023_places_budget_atomic.sql:113  key = constant
--   2  per-caller join throttle   this file                 key = uid
--
-- PER-CALLER KEY, NOT A CONSTANT. The invariant this lock protects is per-uid:
-- the count is `WHERE uid = v_uid` (016:96) and the bound is "10 for THIS
-- caller", so only concurrent calls from the same session can race it and two
-- different callers have nothing to serialise. A constant key would be actively
-- harmful here — it would funnel every join_room in the system through one lock,
-- turning the app's second-hottest RPC into a global queue and handing anyone a
-- denial of service (open a slow transaction, hold the lock, nobody joins a room
-- anywhere). That is the opposite of 023:88-95, where the key MUST be constant
-- because the global ceiling counts rows across all users and the invariant
-- itself spans them. Match the key to the scope of the invariant, not to the
-- migration you are copying.
--
-- Lock ordering, since this function acquires a second advisory lock further
-- down: the members INSERT fires trg_room_member_limit, which takes the salt-0
-- room lock (022:78). Every caller therefore takes uid-then-room, in that order,
-- and a uid lock is never contended between different callers — so there is no
-- cycle and no deadlock against the member cap.
--
-- Everything else is byte-for-byte 019:103-151 (which is 016:82-130 minus the
-- age parameter): same 3-argument signature, same SECURITY DEFINER, same
-- `SET search_path = public`, same idempotent re-join, same single
-- indistinguishable NULL for unknown-code / full-room / lost-race, same 10-per-
-- hour window and same 1-day prune. CREATE OR REPLACE preserves the function's
-- ACL (026:64-66), so 019:160's `GRANT EXECUTE ... TO authenticated` survives and
-- is deliberately not restated.
CREATE OR REPLACE FUNCTION join_room(p_code text, p_name text, p_policy_version text) RETURNS uuid
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

-- ---------------------------------------------------------------------------
-- PROBE — finding 3. One session, 20 simultaneous failing joins. ZZZZZZ is a
-- well-formed code (Z is in the 016:36 alphabet) that is almost certainly not in
-- use — confirm with `SELECT 1 FROM rooms WHERE code = 'ZZZZZZ';` and pick
-- another string from that alphabet if it returns a row, because a code that
-- exists and has a free seat would JOIN instead of failing.
-- ---------------------------------------------------------------------------
--   SB=https://<ref>.supabase.co ; ANON=<anon key> ; JWT=<one session's token>
--   for i in $(seq 1 20); do
--     curl -s -o /dev/null -w '%{http_code} ' -X POST "$SB/rest/v1/rpc/join_room" \
--       -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
--       -H 'content-type: application/json' \
--       -d '{"p_code":"ZZZZZZ","p_name":"probe","p_policy_version":"2026-07-27"}' &
--   done; wait; echo
--   Expect 10x 200 (body `null`) and 10x 400 (`too_many_attempts`), in any order.
--   Then, in the SQL editor (join_attempts is default-deny to clients, 016:16-19):
--     SELECT count(*) FROM join_attempts
--      WHERE uid = '<the session uid>' AND attempted_at > now() - interval '1 hour';
--     -- must be exactly 10
--   Before 030 the same burst lands well above 10 — that count IS the finding.
--   Clean up:  DELETE FROM join_attempts WHERE uid = '<the session uid>';

-- ===========================================================================
-- 4. A deleted user's token must not be able to write
-- ===========================================================================
-- Its own transaction: this is the one statement that can fail for a reason
-- unrelated to everything above (REFERENCES on auth.users), and sections 1-3
-- must not roll back with it. It is also the only section that changes what
-- happens on a path this repo does not control.
BEGIN;

-- `members.id` is a bare uuid PK (001:14) that create_room/join_room fill from
-- auth.uid(). Supabase access tokens stay signature-valid until they expire —
-- up to an hour after `deleteUser` — so between deletion and expiry a retained
-- token can still create a room or join one, writing a member row keyed to a uid
-- with no auth.users row behind it. That row is then permanently unreachable:
-- delete_my_data() is scoped by auth.uid() and no session can ever present that
-- uid again, so nothing in the product can remove it. It holds a display name,
-- a consent record and (through swipes) a preference history.
--
-- The FK closes the write and makes the cleanup automatic in the same line.
--
-- NOT VALID, same rationale as 017:25-32, 018:21-29, 019:29-34 and 022:44-53:
-- rows written before this constraint may already violate it (that is finding 4
-- happening), and a validating ALTER would abort on the first one. NOT VALID
-- skips only the initial scan — the check trigger still fires on every future
-- INSERT and UPDATE, which is the entire attack path, and the ON DELETE CASCADE
-- action trigger fires for EVERY auth.users delete including rows that predate
-- the constraint.
--
-- ORDERING AGAINST delete_my_data() AND delete-account: unchanged and still
-- correct, but now load-bearing in a second way. delete-account/index.ts:43-54
-- calls delete_my_data() first (which snapshots the room's matches, then deletes
-- the member row) and admin.deleteUser() second, so by the time the cascade
-- could fire there is no member row left and it is a no-op. The comment at
-- index.ts:43-49 argues the order from data-orphaning; after this migration the
-- reverse order would not orphan the room data, it would DESTROY it — cascade
-- the member row, cascade their swipes with it (001:35), and take the surviving
-- partner's live match history along, with no snapshot ever taken. Never reorder
-- those two calls.
--
-- THE SNAPSHOT SURVIVES THE CASCADE AND GAINS NOTHING FROM IT. `matches` is
-- keyed (room_id, item_id) with FKs to rooms and items only (021:36-41) — there
-- is no member_id, no uid and no display name anywhere in it, which 021:21-32
-- explains is the design constraint, not an omission. So this FK cannot reach a
-- snapshot row: deleting an auth user cascades members -> swipes and stops. A
-- snapshot taken before the delete keeps standing exactly as 021 intends, and
-- adding this constraint does not put one byte of the departing member's
-- identity into it.
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_id_auth_users_fkey;
ALTER TABLE members
  ADD CONSTRAINT members_id_auth_users_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

COMMENT ON CONSTRAINT members_id_auth_users_fkey ON members IS
  'members.id is auth.uid(); this ties the row to the account and removes it when the account goes. Closes the 2026-07-28 P3 where an access token still valid after deleteUser could write a member row nothing could ever delete. NOT VALID so pre-existing orphans are grandfathered; enforced on all new rows and on every auth.users delete.';

COMMIT;

-- ---------------------------------------------------------------------------
-- PROBE — finding 4
-- ---------------------------------------------------------------------------
--   a. The constraint is there, cascading, and not validated:
--        SELECT conname, convalidated, confdeltype,
--               confrelid::regclass AS references_table
--          FROM pg_constraint
--         WHERE conrelid = 'public.members'::regclass AND contype = 'f';
--        -- members_id_auth_users_fkey | f | c | auth.users
--   b. The write is refused. Sign in a throwaway anonymous session, KEEP its
--      access token, delete that user (Dashboard -> Authentication -> Users, or
--      the admin API), then with the same now-orphaned token:
--        curl -X POST "$SB/rest/v1/rpc/create_room" \
--          -H "apikey: $ANON" -H "Authorization: Bearer $DEAD_JWT" \
--          -H 'content-type: application/json' \
--          -d '{"p_name":"ghost","p_policy_version":"2026-07-27"}'
--        -> 500, 'insert or update on table "members" violates foreign key
--           constraint "members_id_auth_users_fkey"'
--        Before 030 this returns a fresh room code and leaves a member row no
--        session can ever reach. PostgREST runs the RPC in one transaction, so
--        the failure also rolls back the room create_room had already inserted —
--        no orphan room is left behind by this probe.
--   c. The cascade works. Repeat (b) but let the throwaway session create a room
--      FIRST, then delete the user:
--        SELECT count(*) FROM members WHERE id = '<dead uid>';   -- 0
--   d. Any pre-existing orphans (there may be none):
--        SELECT m.id, m.room_id, m.joined_at
--          FROM members m LEFT JOIN auth.users u ON u.id = m.id
--         WHERE u.id IS NULL;
--      Read the risk list below BEFORE deleting any of them, then:
--        ALTER TABLE members VALIDATE CONSTRAINT members_id_auth_users_fkey;

-- ===========================================================================
-- RISKS A HUMAN SHOULD READ BEFORE APPLYING THIS FILE
-- ===========================================================================
-- 1. DELETING AN AUTH USER OUT OF BAND IS NOW DESTRUCTIVE. After section 4, a
--    delete from Dashboard -> Authentication -> Users (or any admin-API call
--    that is not the delete-account function) cascades the member row and, with
--    it, that member's swipes — and the surviving partner's live matches
--    disappear with them, silently, because no snapshot was taken. That is
--    exactly the P2 021 exists to fix, re-entered through a door the product
--    does not use but a human does. Before deleting a user by hand, take the
--    snapshot yourself, as the postgres role in the SQL editor:
--      INSERT INTO matches (room_id, item_id)
--        SELECT rm.room_id, rm.item_id FROM room_matches rm
--         WHERE rm.room_id = (SELECT room_id FROM members WHERE id = '<uid>')
--        ON CONFLICT DO NOTHING;
--    That statement works precisely because the gate from section 1 lives in RLS
--    rather than in the view: the owner is not RLS-filtered, so room_matches
--    still returns every row for the room even though auth.uid() is NULL in the
--    SQL editor. The rows it writes carry matched_at = now(), which is at or
--    after the surviving partner's joined_at, so they can read them.
-- 2. THE GATE IS FAIL-CLOSED ON A NULL joined_at. A member row with a NULL
--    joined_at sees no snapshot rows at all. Run the pre-apply check above; the
--    schema makes this unreachable today (001:17 defaults it and no writer sets
--    it), but a hand-written INSERT could reach it.
-- 3. RE-RUNNING 021 REVERTS FINDING 2. Its `GRANT SELECT ON public.matches TO
--    authenticated` is table-level and will silently overwrite the column grant.
--    Re-run 030 after any re-run of 021. (Re-running 004 likewise still reverts
--    022's column-restricted UPDATE on rooms — unchanged by this file, and still
--    the reason nobody should re-run a grant file alone.)
-- 4. SECTION 4 CAN FAIL ON PRIVILEGES. Creating an FK to auth.users needs
--    REFERENCES on that table; `postgres` in the SQL editor has it, a
--    lesser-privileged role does not. Its own transaction means a failure there
--    leaves sections 1-3 applied and working. Re-run just section 4 afterwards.
-- 5. THE COLUMN-PRIVILEGE ASSUMPTION IN SECTION 1b. If policy expressions turn
--    out to be column-checked on this server, reads of matches/room_matches
--    return 42501 for matched_at. Probe 2 detects it in one request and the
--    fallback is documented there. It is a visible, one-line failure, not a
--    silent one.
-- 6. NOT EXERCISED BY ANY AUTOMATED TEST. None of these four changes is
--    reachable from jest — the suite covers pure TypeScript in lib/ and the edge
--    functions' logic modules, and this migration adds no TypeScript. The probes
--    above are the verification, and finding 3's is the only one of the four
--    that needs concurrency to observe. 022's advisory lock was reviewed but
--    never exercised (HANDOFF.md records that honestly); the probe in section 3
--    is exercisable by hand, so run it rather than repeating that.
