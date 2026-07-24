# Account Settings hub + price-filter fix (plan)

**Status:** plan only, not built. Scheduled after T9 Phase B (recovery codes). Build on a branch off `main`.

## Motivation

Two problems, one home:
1. **Price filter is broken** — deselecting price tiers on the restaurants deck hides little or nothing, and the choice resets every visit.
2. **Settings are scattered** — email/auth lives on `/account`, locations on `/settings` (room-scoped), the price filter is ephemeral inside the deck. The user wants one coherent **Account Settings** hub holding email, notification preferences (future), and price-range settings.

## Part A — Price-filter bug

**Root-cause hypothesis (verify before fixing):** `filterDeck` ([lib/deck.ts:17](../../lib/deck.ts)) passes any item whose `price_level == null`. Google Places (New) frequently omits `priceLevel`, so many/most restaurant rows likely have `price_level = null` → narrowing the tiers hides nothing → the filter looks dead. The edge-function mapping itself is correct (`priceLevelNum` in [supabase/functions/get-restaurants/logic.ts](../../supabase/functions/get-restaurants/logic.ts) maps the `PRICE_LEVEL_*` enum), so this is a **data-sparsity** issue, not a mapping bug. Cached rows created before the T14 price enrichment may also be null.

Second defect: the filter set is **ephemeral** — re-initialized to all-tiers-on every time the deck mounts ([app/swipe/[category].tsx:29](../../app/swipe/%5Bcategory%5D.tsx)). Even when it works, the choice never sticks.

**Diagnose first (don't guess):**
1. Live DB: `SELECT price_level, count(*) FROM items WHERE category='restaurants' GROUP BY price_level;` — measure the null share.
2. Spot-check that `get-restaurants` stores non-null for places Google *does* price.

**Fix approach (depends on the data):**
- If nulls dominate: add an explicit **"Unpriced"** toggle so users can choose to hide unknown-price items, instead of the current silent always-pass. This makes the filter actually act on the bulk of the data.
- Optionally backfill `price_level` on existing cached rows by re-fetching, if Google has it. Accept nulls otherwise.
- Persist the filter as a user preference (Part B) so it survives revisits.

## Part B — Account Settings hub

Proposed single **Settings** screen with sections, replacing the current locations-only `/settings`:

| Section | Scope | Status |
|---------|-------|--------|
| Account (email upgrade/sign-in, sign out) | per-user | exists on `/account` — link or inline |
| Notifications (match alerts, etc.) | per-user | **stub now**, real when push exists |
| Price range (restaurants) | see decision | move here from the deck, persisted |
| Locations | per-room (shared) | exists — keep, mark "shared with partner" |

**Watch the room-gating:** the current `/settings` hard-redirects to `/` when there's no room ([app/settings.tsx:47](../../app/settings.tsx)). Account + price + notifications must NOT require a room. The hub must drop the top-level redirect and gate **only the Locations section** on `room`.

### Decisions needed before build

1. **Price-filter scope — per-user vs per-room.** Locations are room-shared; price could be too, or a personal per-user comfort each partner sets for their own deck view. **Recommend per-user** (it reads as a personal preference, and the user grouped it under "account settings").
2. **Persistence mechanism.**
   - *AsyncStorage (per-user, per-device)* — simplest, no schema, mirrors how the theme override already persists. Not synced across devices.
   - *DB-backed (per-user, synced)* — a column/table keyed by `auth.uid()` + RLS.
   **Recommend AsyncStorage for MVP**, upgrade to DB sync later (pairs with durable identity now that T9 auth exists).
3. **Notifications section** — stub-only until push notifications are built (push was unlocked by T9 auth but isn't implemented). Confirm it's just a disabled placeholder for now.

## Phased implementation

1. **Diagnose price data** — run the DB query, confirm the null share. → verify: counts printed.
2. **Persisted price preference** — an AsyncStorage-backed hook (like the theme override); `PriceFilter` reads/writes it; the deck reads it instead of local state. Add the "Unpriced" toggle + adjust `filterDeck`. → verify: unit-test filter+persistence logic in `lib/`; set filter, revisit deck, choice sticks.
3. **Settings hub screen** — sectioned Settings (Account link, Price range, Notifications stub, Locations). Remove the top-level room-redirect; gate only Locations on `room`. → verify: as a no-room user Account+Price render; as a room user Locations also renders; drive both in browser.
4. **(Later) Real notification preferences** — when push notifications land.

## Dependencies / out of scope

- Notification prefs stay a stub until push notifications exist.
- Cross-device sync of the price preference is the DB-backed upgrade, deferred.
- No change to the room-shared Locations behavior beyond relocating it into the hub.
