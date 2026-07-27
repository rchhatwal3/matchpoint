# Price filter → per-room, DB-backed (shared with partner) — plan

**Status:** plan only, awaiting approval to build. Supersedes the *persistence* half of
`2026-07-23-account-settings-and-price-filter-plan.md` (that plan's Part A — the "Unpriced"
tier-0 toggle + persisted selection — **already shipped**; only the persistence *location*
changes here). Build on a branch off `main`.

## Decision (locked 2026-07-26)

Price-tier selection is **per-room and DB-backed** — shared between partners and synced across
devices, exactly like `rooms.locations`. (Chosen over the shipped per-user/per-device
localStorage+SecureStore model in `lib/usePriceLevels.ts`.) Rationale the user gave: price is a
shared decision for the pair's deck, not a private per-device preference.

## What already exists (do not rebuild)

- `lib/price-filter.ts` — `PRICE_TIERS = [1,2,3,4,0]`, `allPriceTiers()`, tier-0 = "Unpriced".
  Pure, unit-tested. **Keep.** (`serialize/parsePriceTiers` are string-store helpers for the
  local hook — they become dead once the hook is removed; delete them with the hook.)
- `components/PriceFilter.tsx` — the `$ $$ $$$ $$$$ ?` chip row. **Keep, unchanged** (already
  takes `selected: Set<number>` + `onToggle` from the parent).
- `lib/deck.ts` `filterDeck(...)` — maps `price_level ?? 0` against the selected set. **Keep,
  unchanged** (pure; source of the selected set is swapped, its shape isn't).
- `app/swipe/[category].tsx` — renders `PriceFilter` + the `pricedOut` empty state. **Keep**;
  only swap where `priceLevels`/`toggle` come from.
- **Remove:** `lib/usePriceLevels.ts` (per-device store) + its `jest.config.js` coverage
  exclusion `!lib/usePriceLevels.ts`.

## How locations work today (the exact pattern to mirror)

- `rooms.locations text[] NOT NULL DEFAULT '{}'` (`001_schema.sql`).
- **No RPC.** `updateLocations` (`providers/SessionProvider.tsx:324`) writes directly:
  optimistic `setRoom({...prev, locations: clean})`, then
  `supabase.from('rooms').update({ locations: clean }).eq('id', room.id)`.
- RLS (`002_rls.sql`) lets either member UPDATE their room row; column-level is *not*
  restricted (documented trade-off) — so a plain column write is the established pattern.
- Realtime: `rooms` is in the `supabase_realtime` publication (`006_realtime_rooms.sql`); the
  `postgres_changes` sub on `rooms` (`SessionProvider.tsx:203`) re-selects the row on any edit,
  so a partner's price change **syncs for free** — same wire as locations.
- `Room` type carries `locations: string[]`; every room read selects
  `id, code, locations, created_at` (4 sites: initial load, create, join, realtime re-fetch).

Price tiers reuse all of this verbatim — no new RPC, no new realtime wiring.

## Migration number

Use **`015_room_price_tiers.sql`**. `013`/`014` are claimed by the consent-checkboxes plan
(`013_consent.sql`, `014_delete_my_data.sql`); this must not collide if both land near each
other. If consent hasn't merged yet, 013/014 are still reserved — do not reuse them.

---

## Phased implementation

### Task 1 — pure: normalize DB tiers → Set (lib, tested)

**Files:** modify `lib/price-filter.ts`; modify `lib/price-filter.test.ts`.

Add a pure helper that turns the DB value (`number[] | null`) into a valid `Set<number>`,
falling back to all-tiers-on for null/empty/corrupt — the same safety `parsePriceTiers` gave
the string store:

```typescript
/** DB int[] (rooms.price_tiers) → a valid tier Set. null/empty/corrupt → all tiers on. */
export function normalizePriceTiers(raw: number[] | null | undefined): Set<number> {
  const tiers = (raw ?? []).filter((n) => Number.isInteger(n) && isTier(n));
  return tiers.length ? new Set(tiers) : allPriceTiers();
}
```

Delete `serializePriceTiers`/`parsePriceTiers` **only after** Task 4 removes their last caller.

- **Failing test first:** `normalizePriceTiers([2,3])` → `Set{2,3}`; `[]`/`null`/`[7,'x' as any]`
  → `allPriceTiers()`; drops junk but keeps valid subset.
- Verify: `npm test -- price-filter` passes; `npm run test:ci` coverage ≥90% stays green.

### Task 2 — migration: `rooms.price_tiers`

**Files:** create `supabase/migrations/015_room_price_tiers.sql`.

```sql
-- 015_room_price_tiers.sql
-- Shared, per-room restaurant price-tier filter (mirrors rooms.locations): both
-- partners see and edit one selection, synced live via the rooms realtime pub.
-- Tier 0 = "Unpriced". Default = every tier on (nothing hidden) for existing +
-- new rooms. Same column-write + RLS trust model as locations (002_rls note).
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS price_tiers smallint[] NOT NULL DEFAULT '{0,1,2,3,4}';
```

No grant/RLS/publication change — `rooms` UPDATE is already granted to `authenticated`, RLS
already scopes it to members, and the realtime publication already carries `rooms`.

- **Manual step (add to `MANUAL_TODOS.md`):** apply `015` (SQL editor or `supabase db push`)
  **before** shipping a bundle that selects `price_tiers`, or online room reads error with
  "column rooms.price_tiers does not exist" (same rule that bit `009_item_price`).

### Task 3 — provider: read + write per-room tiers

**Files:** modify `lib/types.ts` (`Room`), `providers/SessionProvider.tsx`.

1. `Room` type: add `price_tiers: number[]`.
2. `OFFLINE_ROOM`: add `price_tiers: [0,1,2,3,4]`.
3. Every room `select(...)` (initial load, create, join, realtime re-fetch) → append
   `price_tiers` to the column list. **All 4 sites** (grep `', created_at'` / `'id, code, locations'`).
4. Add `updatePriceTiers(tiers: number[])` mirroring `updateLocations` exactly:
   optimistic `setRoom({...prev, price_tiers})`, then (online) `.update({ price_tiers })
   .eq('id', room.id)`; offline branch just keeps the optimistic state (no DB), like
   `updateLocations` does. Expose it on the `useSession()` value + its `useMemo` deps.

### Task 4 — deck: consume room tiers instead of the local hook

**Files:** modify `app/swipe/[category].tsx`; delete `lib/usePriceLevels.ts`; modify
`jest.config.js` (drop the `!lib/usePriceLevels.ts` exclusion).

Replace:
```tsx
const { priceLevels, toggle: togglePrice } = usePriceLevels();
```
with room-derived state:
```tsx
const { room, updatePriceTiers, /* …existing… */ } = useSession();
const priceLevels = useMemo(() => normalizePriceTiers(room?.price_tiers), [room?.price_tiers]);
const togglePrice = useCallback((level: number) => {
  const next = new Set(priceLevels);
  next.has(level) ? next.delete(level) : next.add(level);
  void updatePriceTiers([...next]);
}, [priceLevels, updatePriceTiers]);
```
`filterDeck`, `PriceFilter`, and the `pricedOut` empty state are untouched. Remove the now-dead
`serialize/parsePriceTiers` from `lib/price-filter.ts` (+ their tests).

### Task 5 — verify (before PR)

- `npm run test:ci` → PASS, coverage ≥90% (Task 1 helper covered; removed hook no longer skews).
- `npm run typecheck` · `npm run lint` → clean.
- `grep -rEn "#[0-9a-fA-F]{6}" app components providers --include="*.tsx"` → 0 hits.
- `npx expo export --platform web` → builds.
- **Browser E2E against live backend (after 015 is applied):** deselect `$$` in room from
  browser A → the `$$` deck items vanish; open the same room in browser B → the `$$` chip shows
  deselected too (partner sync) and its deck matches; toggle "?" hides the ~62% unpriced rows;
  reload → selection persists (it's on the room row, not the device).
- `/caveman-review` on the branch diff; resolve findings. Open PR with `gh pr create`, STOP.

## Notes / out of scope

- The Settings-hub relocation (Part B of the older plan) is **separate** and not in this plan —
  this only moves the deck's price filter from device storage to the room. The chip row stays on
  the deck.
- Cross-provider/DB-key concerns don't apply — price rides the existing room row and its RLS.
- Column-level RLS is unchanged: a member can still write any `rooms` column; `price_tiers` is
  the same shared-settings trust level as `locations` (documented in `002_rls.sql`).
