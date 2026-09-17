# T13 rollback runbook — one person, many rooms

Everything an operator needs to apply, verify, or undo the T13 membership change,
written to be followed under pressure. Read the whole of the "Before you touch
anything" section first; it is short and two of the three items are the ones
people get wrong.

---

## Before you touch anything

**1. `supabase db push` MUST NOT be used on this project. Not for T13, not for
anything.**

`supabase_migrations.schema_migrations` on this project is **empty**. Every
migration in this repo's history was applied by a human pasting it into the
Supabase SQL editor, so the CLI has no record that any of them ran. A push would
conclude that nothing has been applied and try to run all 35 files from `001`
onward against a live, populated database. The three files below are run
**individually**, by pasting each one into the SQL editor and pressing Run.

**2. The migrations and the client must go live together. Between them the app
is broken.**

The currently deployed web client reads `members.id` and `swipes.member_id`.
`033` deletes both columns. From the moment `033` commits until the new client
build is live on GitHub Pages, **the live app is broken for every user** — not
degraded, broken: reads of members and swipes fail, the room screen has no
member list, and the decks cannot record a swipe. There is no version of this
change that is safe to apply early.

Plan the window: apply `033`, `034`, `035` back to back with no pause between
them, and have the client deploy already built and ready to publish. `033`'s own
comment (`supabase/migrations/033_memberships_schema.sql:88-94`) describes a
second, shorter window inside the batch — between `033` and `034`, members has
no SELECT policy and swipes has none at all. Every path in that window fails
closed, so nothing is exposed; it is just more downtime. Do not stop in the
middle to check something.

**3. The data backup lives outside the repository, and it was taken AFTER the
change — the pre-change snapshot was lost.**

```
~/Documents/Code_Projects/matchpoint-backups/2026-09-16-post-t13/
    members.json
    swipes.json
    rooms.json
    matches.json
```

A snapshot of these four tables was taken immediately before `033`, but it was
kept in an agent session's scratch directory under `/private/tmp`, which was
cleared between sessions. It is gone. No data was lost as a result: the
migrations were verified to keep every row (43 members, 398 swipes, 34 rooms,
26 matches), and the rollback script moves data back from the existing columns
rather than from any backup. But it left no independent copy, so a fresh export
was taken straight after `033`–`035` were applied, to the path above, in a
directory readable only by its owner and confirmed to be outside every git
repository. Because it was taken after the change, it is in the **new** shape
(`members.user_id`, `swipes.user_id` and `swipes.room_id`).

This is **not** in the repository and must never be committed to it. The
repository is public — GitHub Pages serves the live site from it — and these
four files are real user data: display names, consent records, join timestamps
and every swipe every user has made. **Lesson for next time: never keep a
backup you might need in a temporary or session directory.**

---

## What is being applied

Three files, in this order, each already wrapped in its own `BEGIN; ... COMMIT;`:

| Order | File | What it does |
| --- | --- | --- |
| 1 | `supabase/migrations/033_memberships_schema.sql` | Re-keys `members` from `id = auth.uid()` to `(user_id, room_id)`; adds `room_id` to `swipes` and re-keys it to `(user_id, room_id, item_id)` with a composite FK; drops the four policies that read the old columns; replaces the `room_matches` view; widens the member-cap trigger to `BEFORE INSERT OR UPDATE`. |
| 2 | `supabase/migrations/034_memberships_policies.sql` | Adds `private.is_room_member(uuid, uuid)` and `private.member_joined_at(uuid, uuid)`; rewrites all seven RLS policies around them; drops `private.member_room_id(uuid)` and the one-argument `private.member_joined_at(uuid)`. |
| 3 | `supabase/migrations/035_memberships_rpcs.sql` | Rewrites `create_room`, `join_room` and `delete_my_data`; adds `leave_room(uuid)`. |

**How to apply:** Supabase Dashboard → SQL Editor → paste the entire contents of
one file → Run → confirm it reports success → move to the next. One file per
run. Do not concatenate them; each manages its own transaction, and `033`
section 4 of the related `030` precedent shows why a file that needs its own
transaction boundary gets one.

---

## Row counts recorded immediately before the change

These are the numbers the live database held the moment before `033` was
applied. They are the yardstick for every verification below: **no step of this
change, and no step of the rollback, may alter any of them.**

| Relation | Rows |
| --- | --- |
| `members` | 43 |
| `swipes` | 398 |
| `rooms` | 34 |
| `matches` | 26 |
| `room_matches` (view) | 56 |

Read them in the SQL editor, where the session runs as `postgres` and therefore
bypasses RLS — `room_matches` is `security_invoker = true`, so counting it as a
client session would return only that session's own rooms.

```sql
SELECT
  (SELECT count(*) FROM public.members)      AS members,
  (SELECT count(*) FROM public.swipes)       AS swipes,
  (SELECT count(*) FROM public.rooms)        AS rooms,
  (SELECT count(*) FROM public.matches)      AS matches,
  (SELECT count(*) FROM public.room_matches) AS room_matches;
-- expect: 43 | 398 | 34 | 26 | 56
```

`room_matches` staying at 56 across the change is not a coincidence to be
shrugged at. The view's definition changes in `033` — it stops reaching through
`members` to find a swipe's room and groups on `swipes.room_id` instead — and
while every user still holds exactly one membership the two definitions are
equivalent. **A different number after `033` means the backfill of
`swipes.room_id` did not do what it was supposed to.** Stop and investigate.

---

## Verifying each migration

### After `033_memberships_schema.sql`

```sql
-- 1. Columns: members has user_id and no id; swipes has user_id + room_id and
--    no member_id.
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name IN ('members','swipes')
 ORDER BY table_name, column_name;
-- members must list user_id and NOT id
-- swipes must list user_id and room_id and NOT member_id

-- 2. Keys and foreign keys.
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid IN ('public.members'::regclass, 'public.swipes'::regclass)
 ORDER BY conrelid::regclass::text, conname;
-- members_pkey                     PRIMARY KEY (user_id, room_id)
-- members_user_id_auth_users_fkey  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID
-- swipes_pkey                      PRIMARY KEY (user_id, room_id, item_id)
-- swipes_membership_fkey           FOREIGN KEY (user_id, room_id) REFERENCES members(user_id, room_id) ON DELETE CASCADE

-- 3. The backfill attributed every swipe to a room.
SELECT count(*) FROM public.swipes WHERE user_id IS NULL OR room_id IS NULL;
-- expect 0. (033 also asserts this itself and aborts, so a non-zero answer here
-- means something wrote rows after it ran.)

-- 4. Nothing was lost.
SELECT (SELECT count(*) FROM public.members) AS members,
       (SELECT count(*) FROM public.swipes)  AS swipes,
       (SELECT count(*) FROM public.room_matches) AS room_matches;
-- expect 43 | 398 | 56

-- 5. The member cap now covers UPDATE.
SELECT tgname, pg_get_triggerdef(oid)
  FROM pg_trigger
 WHERE tgrelid = 'public.members'::regclass AND NOT tgisinternal;
-- trg_room_member_limit ... BEFORE INSERT OR UPDATE ON members

-- 6. EXPECTED AND CORRECT AT THIS POINT: members and swipes have no policies.
SELECT c.relname, p.polname
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
 WHERE c.relname IN ('members','swipes');
-- expect ZERO rows. This is the fail-closed window 033 documents. Do not stop
-- here — run 034 immediately.
```

### After `034_memberships_policies.sql`

```sql
-- 1. All seven policies exist and every one of them routes through the new
--    two-argument helpers.
SELECT c.relname AS table_name, p.polname, p.polcmd,
       pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expr
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
 WHERE c.relname IN ('rooms','members','swipes','matches')
 ORDER BY 1, 2;
-- expect exactly 7 rows:
--   matches  matches_select_same_room  r  is_room_member(uid, room_id) AND matched_at >= member_joined_at(uid, room_id)
--   members  members_select_same_room  r  is_room_member(uid, room_id)
--   rooms    rooms_select_members      r  is_room_member(uid, id)
--   rooms    rooms_update_members      w  is_room_member(uid, id)  [both arms]
--   swipes   swipes_insert_own         a  user_id = uid AND is_room_member(uid, room_id)
--   swipes   swipes_select_same_room   r  is_room_member(uid, room_id)
--   swipes   swipes_update_own         w  user_id = uid  [both arms]
-- No expression may still mention member_room_id.

-- 2. The private schema holds the new pair and nothing else.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proacl
  FROM pg_proc p
 WHERE p.pronamespace = 'private'::regnamespace
 ORDER BY 1, 2;
-- expect exactly: is_room_member(uuid, uuid) and member_joined_at(uuid, uuid)
-- member_room_id must be GONE, and so must the one-argument member_joined_at.
-- proacl on each: the owner plus authenticated=X, and nothing else.

-- 3. `private` is still unexposed. From any client session, all of these must
--    404 (PGRST202) or refuse the schema:
--      POST /rest/v1/rpc/is_room_member
--      POST /rest/v1/rpc/member_joined_at
--    Repeat with an `Accept-Profile: private` header. If any of them answers,
--    `private` has been added to the dashboard's exposed-schema list and the
--    026 membership oracle is open again — remove it before doing anything else.
```

### After `035_memberships_rpcs.sql`

```sql
-- 1. The four RPCs, with the right signatures and grants.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proacl
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('create_room','join_room','leave_room','delete_my_data')
 ORDER BY 1;
-- create_room(text, text)              authenticated=X
-- delete_my_data()                     authenticated=X
-- join_room(text, text, text)          authenticated=X
-- leave_room(uuid)                     authenticated=X   <- new in 035
-- There must be no second overload of any of them.
-- NOTE: create_room, join_room and delete_my_data also carry PUBLIC EXECUTE
-- (shown as a bare `=X/postgres` entry) in the live database — pre-existing
-- state that CREATE OR REPLACE preserves. Only leave_room revokes it. Seeing
-- that extra entry is correct, not a mismatch.

-- 2. Counts still untouched by the RPC rewrite.
SELECT (SELECT count(*) FROM public.members) AS members,
       (SELECT count(*) FROM public.swipes)  AS swipes,
       (SELECT count(*) FROM public.rooms)   AS rooms;
-- expect 43 | 398 | 34
```

Then deploy the client, and verify the thing the change actually exists for, in
the app, with two real sessions:

1. A session already in a room joins a **second** room by invite code. Before
   T13 this returned the generic "invalid code" error; it must now succeed and
   both rooms must be listed.
2. Both rooms still show the right members, the right decks and the right
   matches, and a swipe in one room does not appear in the other.
3. `leave_room` exits one room and leaves the other intact.
4. A third person cannot join either full room ("room full", not a crash).

---

## Rolling back

Run **one file**:

```
supabase/rollback/036_rollback_t13.sql
```

Paste it into the SQL editor and Run, the same way the migrations were applied.
It is deliberately **not** in `supabase/migrations/`, so nothing that walks that
directory can apply it by accident. It is a single `BEGIN; ... COMMIT;`: it
either restores the whole pre-`033` shape or changes nothing at all. It uses
`CASCADE` nowhere, so an unanticipated dependency aborts the run and names
itself rather than being silently deleted.

**Deploy coupling applies in reverse and just as hard.** The file restores
`members.id` and `swipes.member_id`, which the post-T13 client does not read —
it reads `members.user_id`, `swipes.room_id`, and calls `leave_room`, none of
which will exist. Roll the web client back to the pre-T13 build in the same
window, or the app is broken in the other direction. `leave_room` in particular
becomes a 404 from PostgREST, not a graceful no-op.

### Verify the rollback

```sql
-- 1. The old columns are back and the new ones are gone.
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name IN ('members','swipes')
 ORDER BY table_name, column_name;
-- members must list id and NOT user_id
-- swipes must list member_id and NOT user_id, NOT room_id

-- 2. Keys and foreign keys, exactly as they were.
SELECT conname, pg_get_constraintdef(oid), convalidated
  FROM pg_constraint
 WHERE conrelid IN ('public.members'::regclass, 'public.swipes'::regclass)
 ORDER BY conrelid::regclass::text, conname;
-- members_pkey                  PRIMARY KEY (id)
-- members_id_auth_users_fkey    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE  NOT VALID (convalidated = f)
-- members_consent_recorded      CHECK (...)                                                    NOT VALID (convalidated = f)
-- swipes_pkey                   PRIMARY KEY (member_id, item_id)
-- swipes_member_id_fkey         FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE

-- 3. 033's room index is gone; the original indexes are untouched.
SELECT indexname FROM pg_indexes
 WHERE schemaname = 'public' AND tablename IN ('swipes','members') ORDER BY 1;
-- expect idx_members_room_id, idx_swipes_item_id, members_pkey, swipes_pkey
-- swipes_room_id_idx must NOT be listed.

-- 4. NOTHING WAS LOST. This is the one that matters.
SELECT
  (SELECT count(*) FROM public.members)      AS members,
  (SELECT count(*) FROM public.swipes)       AS swipes,
  (SELECT count(*) FROM public.rooms)        AS rooms,
  (SELECT count(*) FROM public.matches)      AS matches,
  (SELECT count(*) FROM public.room_matches) AS room_matches;
-- expect: at least 43 | 398 | 34 | 26 | 56, the pre-change table above.
-- HIGHER is normal and expected if anyone used the app during the T13 window:
-- rooms created, swipes recorded, and snapshot rows written into `matches` by
-- leave_room or delete_my_data all push these up. Higher is not a problem.
-- LOWER is the alarm: any number short of the pre-change figure means data was
-- destroyed. Stop, and restore from the snapshot.

-- 5. The helpers are back to their one-argument form, with the right grants.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proacl
  FROM pg_proc p WHERE p.pronamespace = 'private'::regnamespace ORDER BY 1, 2;
-- expect exactly: member_joined_at(uuid) and member_room_id(uuid)
-- proacl on each: the owner plus authenticated=X. If proacl is NULL, the
-- REVOKE/GRANT pair did not take and EXECUTE is still held by PUBLIC — fix it
-- before letting traffic back in.
-- is_room_member must be gone, and so must the two-argument member_joined_at.

-- 6. Seven policies, all routed back through member_room_id.
SELECT c.relname AS table_name, p.polname, p.polcmd,
       pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expr
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
 WHERE c.relname IN ('rooms','members','swipes','matches')
 ORDER BY 1, 2;
-- expect exactly 7 rows, none mentioning is_room_member:
--   matches  matches_select_same_room  r  room_id = member_room_id(uid) AND matched_at >= member_joined_at(uid)
--   members  members_select_same_room  r  id = uid OR room_id = member_room_id(uid)
--   rooms    rooms_select_members      r  id = member_room_id(uid)
--   rooms    rooms_update_members      w  id = member_room_id(uid)  [both arms]
--   swipes   swipes_insert_own         a  member_id = uid
--   swipes   swipes_select_same_room   r  member_room_id(swipes.member_id) = member_room_id(uid)
--   swipes   swipes_update_own         w  member_id = uid  [both arms]
-- members_insert_self is correctly ABSENT: 017 dropped it and never restored it.

-- 7. The view is 022's again, and it kept its grant.
SELECT pg_get_viewdef('public.room_matches'::regclass, true);
-- must join members m ON m.id = s.member_id, and HAVING count(DISTINCT s.member_id) >= 2
SELECT grantee, privilege_type FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'room_matches';
-- authenticated | SELECT   <- 004_grants.sql:15 survived the CREATE OR REPLACE

-- 8. RPCs restored, leave_room gone.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proacl
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('create_room','join_room','leave_room','delete_my_data')
 ORDER BY 1;
-- create_room(text, text)      authenticated=X
-- delete_my_data()             authenticated=X
-- join_room(text, text, text)  authenticated=X
-- leave_room must NOT appear.

-- 9. The member cap is BEFORE INSERT only again.
SELECT tgname, pg_get_triggerdef(oid)
  FROM pg_trigger
 WHERE tgrelid = 'public.members'::regclass AND NOT tgisinternal;
-- trg_room_member_limit ... BEFORE INSERT ON members   (no "OR UPDATE")
```

Then, with the pre-T13 client build live: create a room, join it from a second
session, swipe the same item in both, and confirm the match appears. That is the
only real test that the policies and the view came back intact.

---

## The one condition that makes rollback lossy

**If any user has joined a second room after the change, the rollback cannot
proceed without destroying data, and it refuses to.**

The pre-`033` model keys `members` on a single `id = auth.uid()`: one person,
one membership row, and that is the primary key, not a convention. A user
holding two membership rows cannot be represented in it at all. Restoring the
key would mean picking one of their rooms and throwing the other away, along
with every swipe in it — silently, in the middle of an incident, to someone who
is watching a row count and will not notice it is three short.

So `036_rollback_t13.sql` opens with a guard that counts users with more than one
membership row and, if it finds any, raises and rolls the whole transaction
back. The error message names the count and gives you the query to list them.
Nothing has been changed when you see it.

Find out who they are:

```sql
SELECT user_id, count(*) AS memberships, array_agg(room_id) AS rooms
  FROM public.members
 GROUP BY user_id
HAVING count(*) > 1
 ORDER BY 2 DESC;
```

You then have two honest options, and no third:

**Option A — decide which membership each of them keeps.** This is a product
decision, not a database one: somebody has to choose, and the users affected
should be told. For each extra membership, remove it the way the app would,
which preserves the partner's match history:

```sql
-- As postgres in the SQL editor, per (user, room) pair to be given up.
-- Snapshot the room's matches FIRST, exactly as leave_room does, or the
-- remaining partner loses their history when the swipes cascade.
INSERT INTO public.matches (room_id, item_id)
  SELECT room_id, item_id FROM public.room_matches WHERE room_id = :room
  ON CONFLICT DO NOTHING;

DELETE FROM public.members WHERE user_id = :user AND room_id = :room;

-- If that emptied the room, it goes too (and takes the snapshot with it).
DELETE FROM public.rooms r
 WHERE r.id = :room
   AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.room_id = r.id);
```

Re-run the guard query above until it returns nothing, then run the rollback
file. Note that the counts in the verification section will now legitimately be
*lower* than 43 / 398 / 34 by whatever you removed — record what you removed, or
the "nothing was lost" check becomes meaningless.

**Option B — restore from the data backup** in
`~/Documents/Code_Projects/matchpoint-backups/2026-09-16-post-t13/`.
That export was taken immediately *after* `033`–`035` were applied, because the
original pre-change snapshot was lost (see the note at the top of this
document). It is therefore in the **new** shape — `members` with `user_id`,
`swipes` with `user_id` and `room_id` — so restore its rows while the schema is
still new, and only then run the rollback script, which carries the data back
into the old columns. This discards everything that happened after the export —
every room joined, every swipe taken, every match made since — and returns the
rows to the state the counts above describe. It is the blunt option, and it is the
right one when the second-room memberships are numerous or when you do not have
the standing to decide which room somebody loses.

Whichever you pick: the snapshot is a scratch directory that is not in the
repository and will not last. If you are reading this in an incident and have
not copied it somewhere durable and private, do that before anything else.
