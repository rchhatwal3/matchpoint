# Multiple Rooms Per Person (T13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one person belong to many two-person rooms, with swipes and matches isolated per room, and a rooms list as the app's home.

**Architecture:** `members` is re-keyed from `id = auth.uid()` to a composite `(user_id, room_id)`, and `swipes` gains `room_id` so a swipe row knows its own room. That lets all seven RLS policies reduce to a single `private.is_room_member(user, room)` call and lets `room_matches` drop its join to `members`. The client keeps its existing single-active-room shape and gains a list alongside it, so no deck, matches, date-night or settings screen changes.

**Tech Stack:** Expo + expo-router + TypeScript, Supabase (Postgres RLS, PostgREST, Deno edge functions), jest.

**Spec:** `docs/superpowers/specs/2026-09-10-multiple-rooms-per-person-design.md` — read it before starting. It records why each decision was made and which alternatives were rejected.

## Global Constraints

- **`@testing-library/react-native` does not work in this repo.** `render` returns an empty object; `screen.getByLabelText` throws "render function has not been called" even for a bare `<Text>`. Write NO component tests. Test pure logic in `lib/`; verify rendering in a real browser.
- **Migrations use explicit `BEGIN;` / `COMMIT;`** and are heavily commented with the reasoning, not just the change. Follow `026_member_room_id_private.sql` as the style reference.
- **A scratch relation must be created and used inside a SINGLE top-level statement** (normally a `DO $$ ... $$` block). Consecutive top-level statements do not always share a session. This is enforced by `supabase/migrations/migration-atomicity.test.ts` — it will fail the build otherwise. None of the migrations below need a scratch relation; do not introduce one.
- **`private` schema helpers follow an exact grant shape:** owner `postgres`, `SECURITY DEFINER`, `STABLE`, `REVOKE ALL ... FROM PUBLIC`, then `GRANT EXECUTE ... TO authenticated`. Not to `anon`. Supabase anonymous sessions carry the `authenticated` role, so `authenticated` is sufficient and `anon` would be wrong.
- **The exposed-schema list is a config invariant.** `private` must never appear in the Supabase Dashboard's exposed schemas; adding it reopens the membership oracle that migration 026 closed.
- **`matches` carries column-scoped SELECT on `(room_id, item_id)` only,** deliberately withholding `matched_at`. Never grant table-level SELECT on `matches`. These migrations use `ALTER TABLE` rather than drop-and-recreate specifically so existing grants survive — do not recreate any table.
- **These three migrations are pushed as one batch and never individually.** The database is inconsistent between them.
- Verification commands: `npm test`, `npm run typecheck`, `npm run lint`.

---

### Task 1: Migration 033 — re-key members and swipes

**Files:**
- Create: `supabase/migrations/033_memberships_schema.sql`
- Test: `supabase/migrations/migration-atomicity.test.ts` (existing; must still pass)

**Interfaces:**
- Consumes: nothing.
- Produces: `members (user_id, room_id, display_name, joined_at, consent_version, consented_at, age_confirmed)` keyed `(user_id, room_id)`; `swipes (user_id, room_id, item_id, liked, created_at)` keyed `(user_id, room_id, item_id)` with FK `(user_id, room_id) → members`. Later tasks reference these column names exactly.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/033_memberships_schema.sql`:

```sql
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

ALTER TABLE public.members DROP COLUMN id;

-- members_consent_recorded stays NOT VALID. 27 rows legitimately predate the
-- consent_version column and validating would require fabricating consent for
-- all of them. DROP COLUMN id does not revalidate it.

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
```

- [ ] **Step 2: Run the atomicity test to confirm the migration is well-formed**

Run: `npm test -- migration-atomicity`
Expected: PASS. If it fails naming a scratch relation, you introduced one — move it into a single `DO $$ ... $$` block.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/033_memberships_schema.sql
git commit -m "feat: re-key members and swipes on (user_id, room_id)"
```

---

### Task 2: Migration 034 — helpers, policies, view

**Files:**
- Create: `supabase/migrations/034_memberships_policies.sql`

**Interfaces:**
- Consumes: the `members`/`swipes` shape from Task 1.
- Produces: `private.is_room_member(p_user uuid, p_room uuid) → boolean` and `private.member_joined_at(p_user uuid, p_room uuid) → timestamptz`. `private.member_room_id(uuid)` no longer exists — nothing may reference it after this migration.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/034_memberships_policies.sql`:

```sql
-- 034_memberships_policies.sql
-- T13 part 2: rewrite every policy that assumed one room per person.
--
-- private.member_room_id(uuid) is DROPPED, not adapted. Its whole contract is
-- "the one room this person is in", which no longer denotes anything. Two
-- replacements take the room as an argument instead.
--
-- GRANT SHAPE. Both helpers copy what 026 established for member_room_id:
-- owner postgres, SECURITY DEFINER, STABLE, EXECUTE revoked from PUBLIC and
-- granted to `authenticated` only. Not `anon`: Supabase anonymous sessions
-- carry the `authenticated` role (002:42-43), which is exactly why a REVOKE
-- alone could never have fixed the 026 oracle. They live in `private` because
-- PostgREST exposes only `public` and `graphql_public`; ADDING `private` TO THE
-- DASHBOARD'S EXPOSED-SCHEMA LIST REOPENS THAT ORACLE.

BEGIN;

CREATE OR REPLACE FUNCTION private.is_room_member(p_user uuid, p_room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM members WHERE user_id = p_user AND room_id = p_room
  );
$$;

REVOKE ALL ON FUNCTION private.is_room_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_room_member(uuid, uuid) TO authenticated;

-- Gains the room argument: a person now has one joined_at per room, and the
-- erasure cut-off below has to compare against the right one.
CREATE OR REPLACE FUNCTION private.member_joined_at(p_user uuid, p_room uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT joined_at FROM members WHERE user_id = p_user AND room_id = p_room;
$$;

REVOKE ALL ON FUNCTION private.member_joined_at(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.member_joined_at(uuid, uuid) TO authenticated;

-- ---- policies ----

-- One expression covers both of the old halves: your own rows are in rooms you
-- belong to, and a partner's rows share a room_id you belong to.
DROP POLICY members_select_same_room ON public.members;
CREATE POLICY members_select_same_room ON public.members
  FOR SELECT USING (private.is_room_member(auth.uid(), room_id));

DROP POLICY rooms_select_members ON public.rooms;
CREATE POLICY rooms_select_members ON public.rooms
  FOR SELECT USING (private.is_room_member(auth.uid(), id));

DROP POLICY rooms_update_members ON public.rooms;
CREATE POLICY rooms_update_members ON public.rooms
  FOR UPDATE
  USING (private.is_room_member(auth.uid(), id))
  WITH CHECK (private.is_room_member(auth.uid(), id));

-- Was private.member_room_id(member_id) = private.member_room_id(auth.uid()):
-- two resolutions of two different rows. Now one call, because the row carries
-- its own room.
DROP POLICY swipes_select_same_room ON public.swipes;
CREATE POLICY swipes_select_same_room ON public.swipes
  FOR SELECT USING (private.is_room_member(auth.uid(), room_id));

-- The is_room_member half is belt-and-braces: swipes_membership_fkey already
-- makes a swipe naming a room you are not in unstorable. It is kept because a
-- policy that states its own intent is worth one call.
DROP POLICY swipes_insert_own ON public.swipes;
CREATE POLICY swipes_insert_own ON public.swipes
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND private.is_room_member(auth.uid(), room_id));

DROP POLICY swipes_update_own ON public.swipes;
CREATE POLICY swipes_update_own ON public.swipes
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- matched_at >= joined_at is 021's erasure control: a member who joins after a
-- match was snapshotted must not see it. It is now scoped to the right room,
-- which the old single-room signature could not express.
DROP POLICY matches_select_same_room ON public.matches;
CREATE POLICY matches_select_same_room ON public.matches
  FOR SELECT USING (
    private.is_room_member(auth.uid(), room_id)
    AND matched_at >= private.member_joined_at(auth.uid(), room_id)
  );

-- ---- the view loses its join ----
--
-- It no longer has to reach through members to discover a swipe's room, so the
-- mutual-like half groups on swipes.room_id directly. security_invoker stays
-- true: the caller's own policies must apply.
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

DROP FUNCTION private.member_room_id(uuid);
DROP FUNCTION private.member_joined_at(uuid);

COMMIT;
```

- [ ] **Step 2: Confirm nothing still references the dropped helper**

Run: `grep -rn "member_room_id" supabase/ providers/ lib/ app/ --include=*.sql --include=*.ts --include=*.tsx | grep -v "^supabase/migrations/0[0-2]"`
Expected: no output. Hits in migrations 002–026 are history and stay as they are; a hit anywhere else is a real break.

- [ ] **Step 3: Run the atomicity test**

Run: `npm test -- migration-atomicity`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/034_memberships_policies.sql
git commit -m "feat: scope every RLS policy to a room membership"
```

---

### Task 3: Migration 035 — RPCs

**Files:**
- Create: `supabase/migrations/035_memberships_rpcs.sql`

**Interfaces:**
- Consumes: `private.is_room_member` from Task 2.
- Produces: `public.leave_room(p_room uuid) → void`. `create_room(text, text)` and `join_room(text, text, text)` keep their existing signatures and return types (`text` code, `uuid` room id or NULL). `create_room` and `join_room` may now raise `too_many_rooms`; `join_room` may still raise `too_many_attempts`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/035_memberships_rpcs.sql`:

```sql
-- 035_memberships_rpcs.sql
-- T13 part 3: the write paths.
--
-- Three behavioural changes and one new function.
--
-- 1. join_room stops swallowing the second-room insert. Its EXCEPTION handler
--    caught unique_violation — the members_pkey collision a second room caused —
--    and fell through to the generic NULL, which the app renders as "invalid
--    code". That silent swallow IS the 2026-09-09 defect. A second room is now
--    the entire point, so only a genuinely full room can still fall through.
--
-- 2. Both entry points gain a 20-rooms-per-person ceiling. This is new exposure
--    created by the feature: an anonymous session could hold exactly one room
--    before and could otherwise now mint unlimited ones. Raised, not returned as
--    NULL, following the too_many_attempts precedent — it reveals only the
--    caller's own count and the branch records nothing, so the rollback is free.
--
-- 3. delete_my_data becomes account-wide. It erased "the caller's room"; a
--    caller now has several and "delete my account" must mean all of them.
--
-- 4. leave_room is new. Its absence is why 2026-09-09 could not be fixed in the
--    app at all: the only exits were "delete my account" and "sign out", and
--    sign-out returns the same uid.

BEGIN;

-- ---- create_room ----

-- PRESERVE THE CODE GENERATION EXACTLY. The alphabet, the gen_random_bytes
-- draw, the modulo-bias comment and `SET search_path TO 'public', 'extensions'`
-- are migration 016's invite-code hardening: 32 unambiguous symbols with I, O,
-- 0 and 1 removed, drawn uniformly because 256 is an exact multiple of 32.
-- `extensions` is on the search_path because gen_random_bytes and get_byte live
-- there. Only two things change in this function: the members INSERT column
-- names, and the ceiling.
CREATE OR REPLACE FUNCTION public.create_room(p_name text, p_policy_version text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code  text;
  v_rooms int;
  i       int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT count(*) INTO v_rooms FROM members WHERE user_id = v_uid;
  IF v_rooms >= 20 THEN
    RAISE EXCEPTION 'too_many_rooms';
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

  INSERT INTO members (user_id, room_id, display_name, consent_version, consented_at)
    SELECT v_uid, r.id, p_name, p_policy_version, now() FROM rooms r WHERE r.code = v_code;

  RETURN v_code;
END;
$$;

-- ---- join_room ----

CREATE OR REPLACE FUNCTION public.join_room(p_code text, p_name text, p_policy_version text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_code    text := upper(trim(p_code));
  v_room_id uuid;
  v_count   int;
  v_fails   int;
  v_rooms   int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Serialises this caller's count-check-record sequence against their own
  -- concurrent calls. Released at transaction end, so it needs no explicit
  -- unlock and none on the rollback the raises below cause either.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 2));

  SELECT count(*) INTO v_fails FROM join_attempts
    WHERE uid = v_uid AND attempted_at > now() - interval '1 hour';
  IF v_fails >= 10 THEN
    -- Safe to RAISE: this branch records nothing. It reveals only the caller's
    -- own history, never whether a code exists.
    RAISE EXCEPTION 'too_many_attempts';
  END IF;

  SELECT id INTO v_room_id FROM rooms WHERE code = v_code;

  -- Already in this room: no-op, return it. Checked before the ceiling so a
  -- capped-out user can still re-open a room they are in.
  IF v_room_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM members WHERE user_id = v_uid AND room_id = v_room_id) THEN
    RETURN v_room_id;
  END IF;

  SELECT count(*) INTO v_rooms FROM members WHERE user_id = v_uid;
  IF v_rooms >= 20 THEN
    RAISE EXCEPTION 'too_many_rooms';
  END IF;

  IF v_room_id IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM members WHERE room_id = v_room_id;
    IF v_count < 2 THEN
      BEGIN
        INSERT INTO members (user_id, room_id, display_name, consent_version, consented_at)
          VALUES (v_uid, v_room_id, p_name, p_policy_version, now());
        RETURN v_room_id;
      EXCEPTION WHEN raise_exception THEN
        -- Lost the race for the second seat: trg_room_member_limit raises
        -- 'room_full' here. Fall through so that race is not an oracle either.
        --
        -- unique_violation is deliberately NOT caught any more. It used to mask
        -- the members_pkey collision from a second-room join; that collision no
        -- longer exists, and swallowing it would hide a real bug.
        NULL;
      END;
    END IF;
  END IF;

  DELETE FROM join_attempts WHERE attempted_at < now() - interval '1 day';
  INSERT INTO join_attempts (uid) VALUES (v_uid);
  RETURN NULL;
END;
$$;

-- ---- leave_room (new) ----

CREATE OR REPLACE FUNCTION public.leave_room(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_remaining int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Not a member: return silently. It must NOT distinguish "not your room" from
  -- "no such room" — that difference is precisely the membership oracle 026
  -- closed.
  IF NOT EXISTS (SELECT 1 FROM members WHERE user_id = v_uid AND room_id = p_room) THEN
    RETURN;
  END IF;

  -- Snapshot BEFORE the delete, while the live swipe rows still exist, so the
  -- partner keeps the matches they already had. Same reasoning as
  -- delete_my_data: room_matches is security_invoker, but inside a SECURITY
  -- DEFINER function the effective user owns the underlying tables and is not
  -- RLS-filtered, so the WHERE clause is what scopes this — it is load-bearing.
  INSERT INTO matches (room_id, item_id)
    SELECT room_id, item_id FROM room_matches WHERE room_id = p_room
    ON CONFLICT DO NOTHING;

  DELETE FROM members WHERE user_id = v_uid AND room_id = p_room; -- cascades swipes

  SELECT count(*) INTO v_remaining FROM members WHERE room_id = p_room;
  IF v_remaining = 0 THEN
    DELETE FROM rooms WHERE id = p_room; -- cascades remnants, snapshot included
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_room(uuid) TO authenticated;

-- ---- delete_my_data: now account-wide ----

CREATE OR REPLACE FUNCTION public.delete_my_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room  record;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Every room, not "the" room. Snapshot each one's matches before removing the
  -- membership, so each surviving partner keeps what they already matched on.
  FOR v_room IN SELECT room_id FROM members WHERE user_id = auth.uid() LOOP
    INSERT INTO matches (room_id, item_id)
      SELECT room_id, item_id FROM room_matches WHERE room_id = v_room.room_id
      ON CONFLICT DO NOTHING;
  END LOOP;

  DELETE FROM members WHERE user_id = auth.uid(); -- cascades swipes

  -- Any room this emptied goes too. Restricted to rooms that now have no
  -- members at all, so a room where the partner remains is untouched.
  DELETE FROM rooms r
   WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.room_id = r.id);

  -- The recovery half is unconditional. 014 returned early when the caller had
  -- no room, which meant an upgraded user who had left their room erased
  -- nothing at all.
  DELETE FROM recovery_codes WHERE user_id = auth.uid();

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NOT NULL THEN
    DELETE FROM recovery_redeem_attempts WHERE email = lower(v_email);
  END IF;
END;
$$;

COMMIT;
```

Note on `DELETE FROM rooms r WHERE NOT EXISTS (...)`: this is safe to run unqualified because `rooms_select_members` does not apply inside a `SECURITY DEFINER` function, and a room with zero members is unreachable by anyone by definition. It also cleans up any pre-existing orphan room, which is a deliberate side benefit — two are known to exist from old probe scripts.

- [ ] **Step 2: Run the atomicity test**

Run: `npm test -- migration-atomicity`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/035_memberships_rpcs.sql
git commit -m "feat: add leave_room, cap rooms per person, erase account-wide"
```

---

### Task 4: Types and the rooms-list pure module

**Files:**
- Modify: `lib/types.ts:61-66`
- Create: `lib/rooms.ts`
- Test: `lib/rooms.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `Member` is now `{ user_id, room_id, display_name, joined_at? }`. `RoomSummary` and the functions `summarizeRooms(rooms, members, myUserId, matchCounts)` and `pickActiveRoom(storedId, summaries)`, both used by Task 6.

- [ ] **Step 1: Change the Member type**

In `lib/types.ts`, replace the `Member` type:

```ts
export type Member = {
  user_id: string;
  room_id: string;
  display_name: string;
  joined_at?: string;
};
```

- [ ] **Step 2: Write the failing tests**

Create `lib/rooms.test.ts`:

```ts
import { summarizeRooms, pickActiveRoom } from './rooms';
import type { Member, Room } from './types';

const room = (id: string, code: string): Room => ({
  id,
  code,
  locations: ['Berkeley, CA'],
  price_tiers: [0, 1, 2, 3, 4],
});

const member = (user_id: string, room_id: string, name: string, joined_at: string): Member => ({
  user_id,
  room_id,
  display_name: name,
  joined_at,
});

describe('summarizeRooms', () => {
  it('pairs each room with my name and my partner name', () => {
    const out = summarizeRooms(
      [room('r1', 'AAAAAA')],
      [member('me', 'r1', 'Ramneek', '2026-01-01T00:00:00Z'), member('you', 'r1', 'Tamana', '2026-01-02T00:00:00Z')],
      'me',
      new Map([['r1', 4]]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].room.code).toBe('AAAAAA');
    expect(out[0].displayName).toBe('Ramneek');
    expect(out[0].partnerName).toBe('Tamana');
    expect(out[0].matchCount).toBe(4);
  });

  it('reports a null partner for a room nobody has joined yet', () => {
    const out = summarizeRooms(
      [room('r1', 'AAAAAA')],
      [member('me', 'r1', 'Ramneek', '2026-01-01T00:00:00Z')],
      'me',
      new Map(),
    );
    expect(out[0].partnerName).toBeNull();
    expect(out[0].matchCount).toBe(0);
  });

  it('orders rooms by when I joined them, newest first', () => {
    const out = summarizeRooms(
      [room('r1', 'AAAAAA'), room('r2', 'BBBBBB')],
      [member('me', 'r1', 'R', '2026-01-01T00:00:00Z'), member('me', 'r2', 'R', '2026-02-01T00:00:00Z')],
      'me',
      new Map(),
    );
    expect(out.map((s) => s.room.id)).toEqual(['r2', 'r1']);
  });

  it('skips a room I hold no membership in', () => {
    const out = summarizeRooms(
      [room('r1', 'AAAAAA')],
      [member('someone', 'r1', 'Else', '2026-01-01T00:00:00Z')],
      'me',
      new Map(),
    );
    expect(out).toEqual([]);
  });

  it('ignores a third membership row rather than picking it as the partner', () => {
    // The two-member cap makes this unreachable, but a summary must not depend
    // on that: it takes the first other member and stays deterministic.
    const out = summarizeRooms(
      [room('r1', 'AAAAAA')],
      [
        member('me', 'r1', 'R', '2026-01-01T00:00:00Z'),
        member('b', 'r1', 'B', '2026-01-02T00:00:00Z'),
        member('c', 'r1', 'C', '2026-01-03T00:00:00Z'),
      ],
      'me',
      new Map(),
    );
    expect(out[0].partnerName).toBe('B');
  });
});

describe('pickActiveRoom', () => {
  const summaries = [
    { room: room('r1', 'AAAAAA'), displayName: 'R', partnerName: null, matchCount: 0 },
    { room: room('r2', 'BBBBBB'), displayName: 'R', partnerName: null, matchCount: 0 },
  ];

  it('keeps the stored room when it is still one of mine', () => {
    expect(pickActiveRoom('r2', summaries)).toBe('r2');
  });

  it('drops a stored room I have left', () => {
    expect(pickActiveRoom('gone', summaries)).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(pickActiveRoom(null, summaries)).toBeNull();
  });

  it('returns null when I have no rooms at all', () => {
    expect(pickActiveRoom('r1', [])).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- rooms`
Expected: FAIL — cannot find module `./rooms`.

- [ ] **Step 4: Write the implementation**

Create `lib/rooms.ts`:

```ts
import type { Member, Room } from './types';

/** A room as the rooms list renders it: who is in it and how it is doing. */
export type RoomSummary = {
  room: Room;
  /** My own display name in this room. */
  displayName: string;
  /** The other member's name, or null while nobody has joined. */
  partnerName: string | null;
  matchCount: number;
};

/**
 * Groups the flat reads — every room I belong to, every member row visible in
 * those rooms — into one summary per room, newest membership first.
 *
 * Pure so the grouping is testable without a database: RLS already guarantees
 * `members` only contains rooms the caller belongs to, so the filtering here is
 * about correctness of display, not access control.
 */
export function summarizeRooms(
  rooms: Room[],
  members: Member[],
  myUserId: string,
  matchCounts: Map<string, number>,
): RoomSummary[] {
  const summaries: RoomSummary[] = [];

  for (const room of rooms) {
    const inRoom = members.filter((m) => m.room_id === room.id);
    const me = inRoom.find((m) => m.user_id === myUserId);
    if (!me) continue; // not mine to show

    const partner = inRoom.find((m) => m.user_id !== myUserId) ?? null;
    summaries.push({
      room,
      displayName: me.display_name,
      partnerName: partner ? partner.display_name : null,
      matchCount: matchCounts.get(room.id) ?? 0,
    });
  }

  return summaries.sort((a, b) => joinedAt(b, members, myUserId) - joinedAt(a, members, myUserId));
}

function joinedAt(summary: RoomSummary, members: Member[], myUserId: string): number {
  const mine = members.find((m) => m.room_id === summary.room.id && m.user_id === myUserId);
  return mine?.joined_at ? Date.parse(mine.joined_at) : 0;
}

/**
 * Resolves the per-device stored active room against what the caller actually
 * belongs to now. A room left on another device, or one they were removed from,
 * must not survive as the active room.
 */
export function pickActiveRoom(storedId: string | null, summaries: RoomSummary[]): string | null {
  if (!storedId) return null;
  return summaries.some((s) => s.room.id === storedId) ? storedId : null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- rooms`
Expected: PASS, 9 tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: errors ONLY in `providers/SessionProvider.tsx` (it still uses `member.id`, fixed in Task 6). Any error elsewhere means something outside the provider read `Member.id` and needs including in Task 6.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/rooms.ts lib/rooms.test.ts
git commit -m "feat: add rooms-list grouping and active-room resolution"
```

---

### Task 5: Navigation gains the rooms hop

**Files:**
- Modify: `lib/nav.ts:22-33`
- Test: `lib/nav.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parentRoute(pathname, hasRoom)` unchanged in signature; `/lobby` now resolves to `/rooms`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/nav.test.ts` inside the existing `describe('parentRoute', ...)`:

```ts
  it('the lobby goes up to the rooms list', () => {
    expect(parentRoute('/lobby', true)).toBe('/rooms');
    expect(parentRoute('/matchpoint/lobby', true)).toBe('/rooms');
  });

  it('the rooms list goes up to the entry screen', () => {
    expect(parentRoute('/rooms', true)).toBe('/');
    expect(parentRoute('/matchpoint/rooms', true)).toBe('/');
  });

  it('settings still goes to the lobby with a room, and now to rooms without one', () => {
    expect(parentRoute('/settings', true)).toBe('/lobby');
    expect(parentRoute('/settings', false)).toBe('/');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- nav`
Expected: FAIL — `parentRoute('/lobby', true)` returns `/lobby` (the fallthrough), expected `/rooms`.

- [ ] **Step 3: Implement**

In `lib/nav.ts`, add two clauses to `parentRoute` before the final `return`:

```ts
  if (path === '/lobby') return '/rooms';
  if (path === '/rooms') return '/';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- nav`
Expected: PASS, all existing cases still green.

- [ ] **Step 5: Commit**

```bash
git add lib/nav.ts lib/nav.test.ts
git commit -m "feat: route the lobby up to the rooms list"
```

---

### Task 6: SessionProvider holds a list plus one active room

**Files:**
- Modify: `providers/SessionProvider.tsx`
- Create: `lib/active-room-storage.ts`

**Interfaces:**
- Consumes: `summarizeRooms`, `pickActiveRoom`, `RoomSummary` from Task 4; `leave_room` from Task 3.
- Produces: the session context gains `rooms: RoomSummary[]`, `activeRoomId: string | null`, `setActiveRoom(roomId: string | null): Promise<void>`, and `leaveRoom(roomId: string): Promise<void>`. `room`, `member`, `partner`, `getItems`, `recordSwipe`, `getMatches`, `getMySwipedItemIds`, `deleteMyData`, `updateLocations`, `updatePriceTiers` all keep their existing names and signatures, so no consuming screen changes.

- [ ] **Step 1: Write the storage glue**

Create `lib/active-room-storage.ts`:

```ts
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Which room this device last had open. Per-device on purpose: it is a UI
 * preference, and storing it on `rooms` or `members` would sync one device's
 * navigation to the other and cost a write per switch.
 *
 * Mirrors the adapter split in lib/supabase.ts — SecureStore on native,
 * localStorage on web, both guarded for no-window render passes.
 */
const KEY = 'matchpoint.activeRoom';

/* istanbul ignore next -- platform storage glue, exercised on-device and in a real browser, not jsdom */
export async function readActiveRoom(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
  }
  return SecureStore.getItemAsync(KEY);
}

/* istanbul ignore next -- platform storage glue, exercised on-device and in a real browser, not jsdom */
export async function writeActiveRoom(roomId: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    if (roomId) window.localStorage.setItem(KEY, roomId);
    else window.localStorage.removeItem(KEY);
    return;
  }
  if (roomId) await SecureStore.setItemAsync(KEY, roomId);
  else await SecureStore.deleteItemAsync(KEY);
}
```

- [ ] **Step 2: Add the new state and context fields**

In `providers/SessionProvider.tsx`, add to the `SessionValue` type alongside the existing fields:

```ts
  rooms: RoomSummary[];
  activeRoomId: string | null;
  setActiveRoom: (roomId: string | null) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
```

Add the imports and the state beside the existing `useState` calls:

```ts
import { summarizeRooms, pickActiveRoom, type RoomSummary } from '@/lib/rooms';
import { readActiveRoom, writeActiveRoom } from '@/lib/active-room-storage';
```

```ts
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
```

- [ ] **Step 3: Rewrite `loadForUser` to build the list, then the active room's triple**

**Declaration order matters.** `applyActiveRoom` is a `const` and `loadForUser` calls it, so `applyActiveRoom` must be declared ABOVE `loadForUser` in the file. Written the other way round it throws `Cannot access 'applyActiveRoom' before initialization` on the first load, not at compile time. Write the helper first:

```ts
  const applyActiveRoom = useCallback(
    (roomId: string | null, summaries: RoomSummary[], members: Member[], myUserId: string) => {
      setActiveRoomId(roomId);
      if (!roomId) {
        setRoom(null);
        setMember(null);
        setPartner(null);
        return;
      }
      const summary = summaries.find((s) => s.room.id === roomId) ?? null;
      setRoom(summary ? summary.room : null);
      setMember(members.find((m) => m.room_id === roomId && m.user_id === myUserId) ?? null);
      setPartner(members.find((m) => m.room_id === roomId && m.user_id !== myUserId) ?? null);
    },
    [],
  );
```

Then replace the body of `loadForUser` (`providers/SessionProvider.tsx:117-145`):

```ts
  const loadForUser = useCallback(async (userId: string) => {
    const client = supabase!;
    setUserId(userId);

    // Two queries, not N+1: `members_select_same_room` already limits members to
    // rooms this caller belongs to, so one read returns me AND every partner
    // across all of them. Grouping happens in summarizeRooms.
    const [{ data: myRooms }, { data: allMembers }, { data: matchRows }] = await Promise.all([
      client.from('rooms').select('id, code, locations, price_tiers, created_at'),
      client.from('members').select('user_id, room_id, display_name, joined_at'),
      client.from('room_matches').select('room_id'),
    ]);

    const counts = new Map<string, number>();
    for (const row of (matchRows ?? []) as { room_id: string }[]) {
      counts.set(row.room_id, (counts.get(row.room_id) ?? 0) + 1);
    }

    const summaries = summarizeRooms(
      (myRooms ?? []) as Room[],
      (allMembers ?? []) as Member[],
      userId,
      counts,
    );
    setRooms(summaries);

    const stored = pickActiveRoom(await readActiveRoom(), summaries);
    applyActiveRoom(stored, summaries, (allMembers ?? []) as Member[], userId);
  }, [applyActiveRoom]);
```

`applyActiveRoom` sets the triple from the already-loaded list, so switching rooms costs no extra round trip.

- [ ] **Step 4: Add `setActiveRoom` and `leaveRoom`**

```ts
  const setActiveRoom = useCallback(
    async (roomId: string | null) => {
      await writeActiveRoom(roomId);
      // seenMatchIds is per-room: a match already announced in one room must not
      // suppress the same item's match in another.
      seenMatchIds.current.clear();
      if (!userId) return;
      await loadForUser(userId);
    },
    [userId, loadForUser],
  );

  const leaveRoom = useCallback(
    async (roomId: string) => {
      if (!supabase) return;
      const { error } = await supabase.rpc('leave_room', { p_room: roomId });
      if (error) throw error;
      if (activeRoomId === roomId) await writeActiveRoom(null);
      if (userId) await loadForUser(userId);
    },
    [activeRoomId, userId, loadForUser],
  );
```

- [ ] **Step 5: Fix the two `member.id` call sites and the deck filter**

`recordSwipe` — the upsert and the partner check both become room-scoped:

```ts
      const { error } = await supabase
        .from('swipes')
        .upsert({ user_id: member.user_id, room_id: member.room_id, item_id: item.id, liked });
      if (error) throw error;
      if (!liked || !partner) return;
      const { data: theirs } = await supabase
        .from('swipes')
        .select('liked')
        .eq('user_id', partner.user_id)
        .eq('room_id', member.room_id)
        .eq('item_id', item.id)
        .maybeSingle();
      if (theirs?.liked) announceMatch(item);
```

`getMySwipedItemIds` — **this is the hazard the spec singles out.** Left keyed on the person, liking a restaurant with one partner permanently removes that card from your deck with every other partner, and the feature looks like it works:

```ts
  const getMySwipedItemIds = useCallback(async (): Promise<Set<string>> => {
    if (!supabase) return new Set(offlineSwipes.current.keys());
    if (!member) return new Set();
    const { data } = await supabase
      .from('swipes')
      .select('item_id')
      .eq('user_id', member.user_id)
      .eq('room_id', member.room_id);
    return new Set(((data ?? []) as { item_id: string }[]).map((s) => s.item_id));
  }, [member]);
```

- [ ] **Step 6: Update the realtime member filter**

In the partner-joins effect (`providers/SessionProvider.tsx:203-220`), the payload no longer has `id`:

```ts
        (payload) => {
          const row = payload.new as Member;
          if (row.user_id !== member.user_id) setPartner(row);
        },
```

In the partner-swipes effect, filter on the room now that swipes carry it — `filter: \`room_id=eq.${room.id}\`` — and ignore rows whose `user_id` is your own.

- [ ] **Step 7: Point `createRoom` and `joinRoom` at the new reload path**

Both currently re-read `members`/`rooms` inline after their RPC. Replace those inline reads in each with `await loadForUser(userId)` followed by `await setActiveRoom(<new room id>)`, so a freshly created or joined room becomes the active one and the list is correct. `create_room` returns the code, so read the room id back by code: `.from('rooms').select('id').eq('code', code.toUpperCase()).maybeSingle()`.

- [ ] **Step 8: Add the new fields to the context value and typecheck**

Run: `npm run typecheck`
Expected: PASS, zero errors.

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS. No existing test touches the provider (component tests do not work here), so this is a regression check on the pure modules.

- [ ] **Step 10: Commit**

```bash
git add providers/SessionProvider.tsx lib/active-room-storage.ts
git commit -m "feat: hold a rooms list alongside one active room"
```

---

### Task 7: The rooms list screen

**Files:**
- Create: `app/rooms.tsx`
- Modify: `app/index.tsx`
- Modify: `app/lobby.tsx`

**Interfaces:**
- Consumes: `rooms`, `activeRoomId`, `setActiveRoom`, `leaveRoom` from Task 6; `RoomSummary` from Task 4.
- Produces: the `/rooms` route that Task 5's `parentRoute` already points at.

- [ ] **Step 1: Build the screen**

Create `app/rooms.tsx`. This uses the same component vocabulary as `app/lobby.tsx` — `Screen`, `Text` with `variant`, `Button`, `CodeDisplay`, and `useTheme()` for `colors`/`spacing`/`radii`. Per `DESIGN.md`, iris-violet (`colors.secondary`, `colors.secondaryContainer`) is the partner colour and vermilion-flame (`colors.primary`) is for actions, which is why the waiting state below is a secondary-container card exactly like the lobby's.

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { CodeDisplay } from '@/components/CodeDisplay';
import type { RoomSummary } from '@/lib/rooms';

export default function Rooms() {
  const { colors, spacing, radii } = useTheme();
  const router = useRouter();
  const { rooms, setActiveRoom, leaveRoom } = useSession();
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);

  const open = async (summary: RoomSummary) => {
    await setActiveRoom(summary.room.id);
    router.push('/lobby');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'], gap: spacing['2xl'] }}>
        <Text variant="headline">Your rooms</Text>

        {rooms.length === 0 ? (
          <View style={{ gap: spacing.md }}>
            <Text variant="body" color={colors.inkMuted}>
              You&apos;re not in a room yet. Create one and share the code, or join with a code
              someone sent you.
            </Text>
            <Button label="New room" variant="filled" onPress={() => router.push('/')} />
          </View>
        ) : null}

        {rooms.map((summary) => (
          <View
            key={summary.room.id}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.outline,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                summary.partnerName
                  ? `Open your room with ${summary.partnerName}`
                  : `Open your room ${summary.room.code}, nobody has joined yet`
              }
              onPress={() => open(summary)}
              style={{ gap: spacing.xs }}
            >
              {summary.partnerName ? (
                <>
                  <View style={[styles.row, { gap: spacing.md }]}>
                    <View
                      style={[styles.dot, { backgroundColor: colors.secondary, borderRadius: radii.full }]}
                    />
                    <Text variant="title">{summary.partnerName}</Text>
                  </View>
                  <Text variant="body" color={colors.inkMuted}>
                    {summary.room.locations.length > 0
                      ? summary.room.locations.join(' · ')
                      : 'No cities saved yet'}
                  </Text>
                  <Text variant="body" color={colors.inkMuted}>
                    {summary.matchCount === 1 ? '1 match' : `${summary.matchCount} matches`}
                  </Text>
                </>
              ) : (
                <Text variant="title">Waiting for someone to join</Text>
              )}
            </Pressable>

            {/* The state that silently swallowed 80 swipes on 2026-09-09: a room
                nobody joined looked identical to a working one. The code lives
                here, on the list, so it is visible without entering the room. */}
            {summary.partnerName === null ? (
              <View
                style={{
                  backgroundColor: colors.secondaryContainer,
                  borderRadius: radii.lg,
                  padding: spacing.lg,
                  gap: spacing.sm,
                }}
              >
                <Text variant="body" color={colors.onSecondaryContainer}>
                  Matches need two people. Send them this code — you can swipe meanwhile, and your
                  likes will be waiting.
                </Text>
                <CodeDisplay code={summary.room.code} />
              </View>
            ) : null}

            {confirmLeave === summary.room.id ? (
              <View style={{ gap: spacing.sm }}>
                <Text variant="body" color={colors.inkMuted}>
                  Leaving deletes your swipes in this room. Matches you already made stay with
                  {summary.partnerName ? ` ${summary.partnerName}` : ' your partner'}. If nobody else
                  is left, the room is deleted.
                </Text>
                <Button
                  label="Leave this room"
                  variant="filled"
                  onPress={() => {
                    leaveRoom(summary.room.id)
                      .then(() => setConfirmLeave(null))
                      .catch((e) => console.warn('leaveRoom failed', e));
                  }}
                />
                <Button label="Cancel" variant="outlined" onPress={() => setConfirmLeave(null)} />
              </View>
            ) : (
              <Button
                label="Leave"
                variant="outlined"
                onPress={() => setConfirmLeave(summary.room.id)}
              />
            )}
          </View>
        ))}

        {rooms.length > 0 ? (
          <Button label="New room" variant="tonal" onPress={() => router.push('/')} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 12, height: 12 },
});
```

`Button`'s `variant="filled"` is verified to exist — it is the component's default (`components/Button.tsx:30`). Do check the two-tap confirm reads consistently with `app/settings.tsx:70-89`, which is the established pattern for a destructive action in this app.

- [ ] **Step 2: Redirect the entry screen once rooms exist**

In `app/index.tsx`, when `rooms.length > 0` and the create/join form has not been deliberately opened, `router.replace('/rooms')`. With no rooms, the screen stays exactly as it is today. Do not gate on `room` — a user with rooms but no active one must still land on the list.

- [ ] **Step 3: Add the lobby's way back**

`app/lobby.tsx` gets nothing new structurally — its `Header` already resolves through `parentRoute`, which Task 5 pointed at `/rooms`. Verify the chevron goes to the list, and add a visible room label (partner name) to the lobby so it is obvious which room is open.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add app/rooms.tsx app/index.tsx app/lobby.tsx
git commit -m "feat: add the rooms list as the app home"
```

---

### Task 8: `get-restaurants` takes an explicit room

**Files:**
- Modify: `supabase/functions/get-restaurants/index.ts:125-138`

**Interfaces:**
- Consumes: `members` shape from Task 1.
- Produces: the request body gains a required `room_id: string`. `providers/SessionProvider.tsx`'s `getItems` must send it.

- [ ] **Step 1: Replace the room guard**

The current guard reads the caller's single membership and uses that room's locations, which assumes one room. Replace `supabase/functions/get-restaurants/index.ts:125-138` with a guard on the room the caller named:

```ts
    // The caller now names the room, because a caller may be in several and
    // the deck must be filtered against the cities of the one they are actually
    // looking at. Membership in THAT room is what authorises the lookup.
    //
    // Both reads are logged on error but still fall through to the same
    // refusals: under RLS a denied row is an empty result, not an error, so
    // "no rows" and "not allowed to see the rows" are indistinguishable here
    // and both correctly refuse. The log is what tells a missing grant apart
    // from a genuinely roomless caller.
    if (typeof roomId !== 'string' || roomId.length === 0) {
      return json({ error: 'No room' }, 400);
    }
    const { data: member, error: memberErr } = await caller
      .from('members')
      .select('room_id')
      .eq('user_id', userData.user.id)
      .eq('room_id', roomId)
      .maybeSingle();
    if (memberErr) console.error('members read failed', memberErr);
    if (!member) return json({ error: 'No room' }, 403);
    const { data: room, error: roomErr } = await caller
      .from('rooms')
      .select('locations')
      .eq('id', roomId)
      .maybeSingle();
    if (roomErr) console.error('rooms read failed', roomErr);
    const allowed = (room?.locations ?? []) as string[];
    if (!isLocationAllowed(loc, allowed)) {
      return json({ error: 'Location not in your room' }, 403);
    }
```

Read `roomId` from the request body where `loc` is already read, and keep the PR #51 structure intact: the anon-key `caller` client does the JWT check and these reads under RLS, and the service client is built only after the guard passes.

- [ ] **Step 2: Send it from the client**

In `providers/SessionProvider.tsx`, `getItems` adds `room_id: room.id` to the `get-restaurants` invoke body.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/get-restaurants/index.ts providers/SessionProvider.tsx
git commit -m "feat: filter the restaurants deck by the room the caller names"
```

---

### Task 9: Deploy and verify cross-room isolation live

**Files:** none — this is a verification task, and its deliverable is evidence.

- [ ] **Step 1: Push the three migrations as one batch**

Run: `supabase db push --linked`
Expected: 033, 034 and 035 all apply. If any fails, the database is mid-change: fix forward, do not deploy the client.

- [ ] **Step 2: Redeploy the edge function**

Run: `supabase functions deploy get-restaurants`

Its contract changed, so this and the client deploy must land together. Recall the gotcha from the last secret rotation: **if OPTIONS preflight 500s, the failure is at module load, not in the handler**, because the `OPTIONS` early-return is the first line of every function.

- [ ] **Step 3: Deploy the client and smoke-test the happy path**

Merge and let the deploy workflow run, then in a browser: create a room, join it from a second session, swipe on both sides, confirm a match appears.

- [ ] **Step 4: Verify cross-room isolation as an ordinary anonymous caller**

This is the property the whole app rests on, and nothing in the existing 40-control review covers leakage between two rooms of the *same* person, because that state could not exist before. Verify it live rather than arguing it from the policy text. Set up user A in rooms R1 and R2, user B in R1 only, then confirm every one of these:

- B reading `members` sees R1 rows only — never A's R2 membership.
- B reading `swipes` and `room_matches` sees R1 only.
- A's R1 deck is not filtered by A's R2 likes. Concretely: like an item in R2, then confirm that item is still dealt in R1.
- `room_matches` for R1 never counts A's R2 swipes toward a mutual like.
- A liking an item in R1 and disliking the same item in R2 leaves both rows intact and disagreeing.

- [ ] **Step 5: Verify the leave and cap paths**

- `leave_room` on a room you are in removes your membership, keeps the partner's matches via the snapshot, and deletes the room when it empties.
- `leave_room` on a room you are NOT in returns without error and changes nothing — and does not reveal whether that room exists.
- `join_room` with a full room's code still returns the generic failure, indistinguishable from an unknown code.
- Joining a second room now succeeds where it previously returned the generic failure.

- [ ] **Step 6: Record the outcome**

Update `HANDOFF.md` and `TODO.md`: close the T13 entry, record what was verified live and what was not, and note any test rooms left behind (clients hold no DELETE grant, so removal needs `leave_room`, `delete-account`, or SQL).

- [ ] **Step 7: Commit**

```bash
git add HANDOFF.md TODO.md
git commit -m "docs: record the T13 rollout and its live verification"
```

---

## Notes for whoever executes this

**Run `/code-review` before merging.** It is a standing gate in this repo, and this change rewrites every RLS policy in the app — exactly the diff worth a second pass.

**Do not trust a stale working tree.** A previous QA agent reported that two applied migrations did not exist because it was reading an unpulled tree; its live observations were sound and its file-based conclusions were wrong. Pull before dispatching agents, and check any "this doesn't exist" claim against the live database.

**Do not run two agents against the same browser tab.** Two have previously shared one and saw each other's synthetic clicks. Also note `expo-router` keeps prior screens mounted as `display:none; aria-hidden="true"` siblings, and accessibility tooling returns refs pointing at those hidden copies — acting on one fires its handler and navigates. Use direct DOM reads and `offsetParent`-filtered clicks.
