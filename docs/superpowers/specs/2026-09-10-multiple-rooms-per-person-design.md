# T13 — multiple rooms per person

Design, 2026-09-10. Status: approved in brainstorming, not yet planned or built.

## Why

`members.id` is the caller's `auth.uid()` and it is the table's primary key, so a
person belongs to exactly one room, permanently. There is no leave-room and no
switch-room anywhere in the app: `app/settings.tsx:89` offers only "Delete my
account" and `app/account.tsx:149` offers "Sign out", which returns the same uid
and therefore changes nothing.

This is not theoretical. On 2026-09-09 room `room A` was reported as showing no
matches. It held one member, who had accumulated 80 swipes and 69 likes over six
weeks. `room_matches` requires `count(DISTINCT member_id) >= 2`, so a
single-member room can never produce a match no matter how much you swipe. Her
partner was in a different room, `room B`, which had 26 matches. Neither person
could reach the other's room from inside the app — `room B` was full, and the
identity holding its second seat was an anonymous account whose session had been
lost, so nobody could operate or erase it. The situation was only resolvable with
direct database writes.

Two secondary defects fall out of the same investigation and are fixed here:

- `join_room` swallows the primary-key violation raised when an existing member
  tries to join a second room, and returns its generic `NULL`. The app renders
  that as an invalid code. The real reason — you are already in a room — is never
  surfaced.
- `enforce_room_member_limit` is `BEFORE INSERT` only, so an `UPDATE` of
  `members.room_id` bypasses the two-member cap entirely.

## Scope decisions

Settled during brainstorming; recorded so they are not relitigated.

- **A room means a pair of people, not a topic.** One room per relationship —
  you and your partner, you and a friend. Rooms stay capped at two members. No
  user-given room names: a room is identified by who else is in it.
- **Swipes are per room, never per person.** Liking a restaurant with one partner
  must say nothing about another. This is the single hardest requirement in the
  design and the easiest to get subtly wrong.
- **Home is a rooms list.** The app opens to the list; you tap a room to enter it.
  Chosen over "open the last room with a header switcher" deliberately, even
  though it costs a tap for someone with one room, because the list is what makes
  a partnerless room visible.
- **`display_name` stays per-membership.** It already lives on `members` and this
  lets someone appear differently to different partners at no cost.
- **Single cutover, not a phased rollout.** One migration, one deploy. Approved on
  the grounds that there are no real users and the existing data is disposable.
  The backfill preserves the current two rooms anyway, because it is nearly free.
- **No pair-uniqueness constraint.** Refusing a second room between the same two
  people would not have prevented the failure above: a partner who loses an
  anonymous session returns as a different uid and is not recognisably the same
  person. Showing the partner's name in the rooms list is what actually surfaces
  duplicates.

## Data model

`members` loses `id` and is keyed on the pair:

```sql
members (
  user_id         uuid not null references auth.users(id) on delete cascade,
  room_id         uuid not null references rooms(id) on delete cascade,
  display_name    text not null,
  joined_at       timestamptz not null default now(),
  consent_version text,
  consented_at    timestamptz,
  age_confirmed   boolean,
  primary key (user_id, room_id)
)
```

`swipes` gains `room_id` and hangs off that composite key:

```sql
swipes (
  user_id    uuid not null,
  room_id    uuid not null,
  item_id    uuid not null references items(id) on delete cascade,
  liked      boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id, item_id),
  foreign key (user_id, room_id) references members(user_id, room_id) on delete cascade
)
```

`rooms` is untouched. The `matches` snapshot table is untouched — it is already
keyed `(room_id, item_id)`, which is correct in a many-rooms world as-is.

**Why the composite key rather than a surrogate `membership_id`.** Because a
swipe row then knows its own room, and every policy gets simpler instead of
harder. `swipes_select_same_room` currently reads
`private.member_room_id(member_id) = private.member_room_id(auth.uid())` — two
function calls resolving two different rows — and was flagged in the 2026-07-28
security review as the likeliest of the five policies to break. It collapses to a
single `is_room_member` call. `room_matches` also stops needing a join to
`members` to discover which room a swipe belongs to. The composite foreign key
makes it impossible for a swipe's `room_id` to disagree with the membership it
belongs to, so the denormalisation cannot drift.

**`members_consent_recorded` stays `NOT VALID`.** Rebuilding the table is an
opportunity to validate it, and that opportunity should be declined: 27 rows
legitimately predate the column, and validating would require fabricating consent
for all of them. Carrying the constraint over unvalidated preserves exactly
today's grandfathering.

**Backfill.** Each `members` row becomes `user_id = old id` keeping its
`room_id`; each `swipes` row takes `user_id = old member_id` and inherits that
member's `room_id`.

## Helpers, policies, view

`private.member_room_id` is dropped. It has no coherent return value once a person
has many rooms. Two replacements, both in the unexposed `private` schema per
migration 026, both `SECURITY DEFINER` with EXECUTE revoked from `public` and
`authenticated`:

- `private.is_room_member(p_user uuid, p_room uuid) → boolean`
- `private.member_joined_at(p_user uuid, p_room uuid) → timestamptz`, gaining the
  room argument since a person now has one `joined_at` per room

**Migration 026's invariant still holds and must be restated wherever it is
recorded: adding `private` to the Dashboard's exposed-schema list reopens the
membership oracle.**

| Policy | Now | After |
|---|---|---|
| `members_select_same_room` | `id = auth.uid() OR room_id = member_room_id(auth.uid())` | `is_room_member(auth.uid(), room_id)` |
| `rooms_select_members` | `id = member_room_id(auth.uid())` | `is_room_member(auth.uid(), id)` |
| `rooms_update_members` | same, USING and WITH CHECK | `is_room_member(auth.uid(), id)`, both |
| `swipes_select_same_room` | `member_room_id(member_id) = member_room_id(auth.uid())` | `is_room_member(auth.uid(), room_id)` |
| `swipes_insert_own` | `member_id = auth.uid()` | `user_id = auth.uid() AND is_room_member(auth.uid(), room_id)` |
| `swipes_update_own` | `member_id = auth.uid()` | `user_id = auth.uid()` |
| `matches_select_same_room` | `room_id = member_room_id(...) AND matched_at >= member_joined_at(...)` | `is_room_member(auth.uid(), room_id) AND matched_at >= member_joined_at(auth.uid(), room_id)` |

`items_select_authenticated` is unchanged. The single-expression form of
`members_select_same_room` covers both of today's halves: your own rows are in
rooms you belong to, and a partner's rows share a `room_id` you belong to.

The `AND is_room_member(...)` on `swipes_insert_own` is belt-and-braces — the
composite foreign key already makes it impossible to insert a swipe naming a room
you are not in. It is kept because a policy that states its own intent is worth
one function call.

The `matched_at >= joined_at` cut-off on `matches_select_same_room` is the
erasure-snapshot control from migration 021. It is now correctly scoped per room,
which the old signature could not express.

`room_matches` loses its join to `members`:

```sql
SELECT s.room_id, s.item_id, i.category, i.title, i.subtitle, i.image_url
  FROM swipes s JOIN items i ON i.id = s.item_id
 WHERE s.liked
 GROUP BY s.room_id, s.item_id, i.category, i.title, i.subtitle, i.image_url
HAVING count(DISTINCT s.user_id) >= 2
UNION
SELECT ms.room_id, ms.item_id, i.category, i.title, i.subtitle, i.image_url
  FROM matches ms JOIN items i ON i.id = ms.item_id;
```

It stays `security_invoker=true`.

### Grants must be reproduced exactly, and one of them is column-scoped

Verified against production on 2026-09-10. Table-level, for `authenticated`:

- `members` — SELECT only. Every write goes through a `SECURITY DEFINER` RPC.
- `swipes` — SELECT, INSERT, UPDATE. No DELETE.
- `rooms` — SELECT, plus column-level UPDATE on `locations` and `price_tiers` only.
- `matches` — **no table-level SELECT.** It carries column-scoped SELECT on
  `(room_id, item_id)` and deliberately withholds `matched_at`.

That last one is easy to get wrong in a rebuild and wrong in both directions:
granting table-level SELECT leaks `matched_at`, and granting nothing breaks the
matches screen. It also makes `has_table_privilege('authenticated',
'public.matches', 'SELECT')` read `false` while the app works correctly — do not
read that as a defect.

## RPCs

`create_room` and `join_room` keep their `pg_advisory_xact_lock`, their
`join_attempts` throttle, and their deliberately generic `NULL` return for
unknown-code-or-full-room, so neither becomes a code-existence oracle.

Both gain a **20-rooms-per-person ceiling**, counted as the number of rooms the
caller currently holds a membership in, and raised as
`RAISE EXCEPTION 'too_many_rooms'` rather than returned as `NULL`. This follows
the existing `too_many_attempts` reasoning: it reveals only the caller's own
count, and the branch records nothing so the rollback costs nothing. The cap is
new exposure created by this change — today an anonymous session can hold exactly
one room; afterwards it could mint unlimited ones.

`join_room`'s primary-key-violation catch is removed. Joining a second room is
now the whole point of the feature.

`delete_my_data()` becomes account-wide: snapshot matches for every room the
caller belongs to, delete all their membership rows, then drop any room left with
zero members. Same guarantees as today, applied N times.

`leave_room(p_room uuid)` is **new** and is the piece whose absence made the
2026-09-09 situation unfixable from inside the app: snapshot that room's matches,
delete just that one membership, drop the room if it is now empty. Called for a
room the caller is not a member of, it returns silently without touching
anything — it must not distinguish "not your room" from "no such room", or it
becomes the same membership oracle migration 026 closed.

`enforce_room_member_limit` keeps its two-member count and becomes
`BEFORE INSERT OR UPDATE`.

## Client

`providers/SessionProvider.tsx` is built around a single `room` / `member` /
`partner` triple with three realtime channels keyed to that room, and the decks,
matches, date night and settings screens all consume that triple. **That shape is
kept.** The provider holds exactly one *active* room and gains a list alongside
it, so no downstream screen changes.

The context grows by three things:

```ts
rooms: RoomSummary[];              // every room I'm in, with partner + pending state
activeRoomId: string | null;
setActiveRoom: (roomId: string | null) => Promise<void>;
```

`loadForUser` changes from "fetch my one member row, then its room and partner"
to "fetch all my member rows joined to rooms, build the list, resolve the active
room, load its triple". This is two queries, not N+1: RLS already permits reading
every `members` row in any room you belong to, so one `members` query returns you
and every partner across all your rooms, and one `rooms` query returns the room
records. Grouping happens client-side in a new pure module.

`Member` becomes `{ user_id, room_id, display_name, joined_at }`, losing `id`.
That ripples into exactly two call sites: `recordSwipe` upserts
`{ user_id, room_id, item_id, liked }`, and its partner-already-liked check
filters on `user_id` plus `room_id`.

The three realtime channels are already keyed on the active room. One improves:
the partner-swipe channel can filter `room_id=eq.<active>` directly, because
swipes finally carry their room. Switching rooms tears down and re-subscribes,
which the existing effect dependencies handle already.

**Active-room persistence is per-device, not in the database.** It is a UI
preference; storing it on `rooms` or `members` would sync one device's navigation
to the other and cost a write per switch. Reuse whatever local storage
`ThemeControl` already uses rather than introducing a second mechanism.

Offline demo mode keeps its single `OFFLINE_ROOM` and renders a one-row list.

### Screens

- `app/rooms.tsx` — **new, and home.** One row per room: the partner's name, the
  locations, a match count. A room with no partner yet shows "Waiting for someone
  to join" with the invite code inline — the state that swallowed 80 swipes. Row
  actions: enter, or leave via the new `leave_room` RPC. Plus "New room" into the
  existing create/join flow.
- `app/index.tsx` — signed out or no rooms, it stays today's create/join entry.
  With rooms, it redirects to `/rooms`.
- `lib/nav.ts` — `parentRoute` gains one hop: decks, matches and date night still
  resolve to `/lobby`; `/lobby` now resolves to `/rooms`; `/rooms` resolves to
  root. Pure and already unit-tested.

The per-room match count is the one optional element here. It is a single
aggregate query against `room_matches` and it is what makes the list worth
reading, but it can be dropped without affecting anything else.

## Edge function

`supabase/functions/get-restaurants/index.ts:126` reads
`.from('members').select('room_id')` for the caller and then uses that one room's
`locations`. That assumes a single membership; with several it either errors or
silently picks one, and the deck would be filtered against the wrong room's
cities.

The request body gains `room_id`, and the guard verifies the caller is a member
of that specific room before doing anything else. This is a breaking change to
the function's contract requiring the redeploy and the client deploy to land
together, which single cutover already accepts. It is also a better shape: an
explicit, verified target beats an implied one.

The guard keeps its PR #51 structure — JWT verification and the caller's own
`members`/`rooms` reads under RLS through an anon-key client, with the service
client built only after the guard passes.

## The hazard most likely to be missed

`getMySwipedItemIds` filters `.eq('member_id', member.id)`. It produces the set of
items you have already swiped, which keeps the deck from re-dealing cards. If it
stays keyed on the person rather than the membership, **liking a restaurant with
one partner permanently removes that card from your deck with every other
partner.** The feature would appear to work while being quietly wrong.

It becomes `.eq('user_id', …).eq('room_id', room.id)`. The composite key makes
this correct fix possible but does not force it, which is exactly why it is
called out here rather than left to be noticed during implementation.

## Testing

`@testing-library/react-native` does not work in this repo — `render` returns an
empty object under the current React and jest-expo versions, so component tests
assert nothing. Logic is tested in `lib/`; rendering is verified in a browser.

- New pure module for grouping raw member rows into the rooms list, including the
  no-partner-yet case. Unit tested.
- `parentRoute`'s new `/rooms` hop, in the existing test file.
- The migration joins `supabase/migrations/migration-atomicity.test.ts`.
- Browser verification of the rooms list, switching rooms, and leaving a room.

### Cross-room isolation needs its own live pass

Nothing in the existing 40-control review covers leakage between two rooms of the
*same* person, because until now that state could not exist. This is the property
the whole app rests on, so it is verified live as an ordinary anonymous caller
with two sessions rather than argued from the policy text.

With user A in rooms R1 and R2, and user B in R1 only:

- B cannot read A's R2 membership, swipes, or matches.
- A's R1 deck is not filtered by A's R2 likes.
- `room_matches` for R1 never counts A's R2 swipes toward a mutual like.
- A liking an item in R1 and disliking the same item in R2 is representable and
  both rows persist independently.

## Out of scope

- Rooms with more than two members. The cap stays at two.
- User-given room names, and rooms as topics rather than pairs.
- Google and Apple sign-in (T9's deferred half), and phone recovery. Durable
  identity would reduce how often a lost anonymous session creates an orphan room,
  but it is a separate piece of work.
- Migrating anyone's existing swipe history *between* rooms. Swipes belong to a
  membership; there is no supported operation that moves them.
