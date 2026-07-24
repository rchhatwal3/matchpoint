# get-restaurants: Foursquare price enrichment + larger decks (design)

**Status:** approved 2026-07-24. Backend feature. Branch `feat/restaurants-foursquare` off `main`. All work in `supabase/functions/get-restaurants/`.

## Goal

1. Serve **~60 restaurants per city** (currently ~20, one Google page).
2. **Fill missing prices** via Foursquare — ~62% of Google Places rows have `price_level = null`.
3. Keep everything **async**; keep the existing cache-first behavior (**no prewarm**).

## Current state (`supabase/functions/get-restaurants/`)

- `index.ts` — auth + room-location allow-list, then **cache-first**: if `>= CACHE_TARGET` (currently 20) rows already stored for the location, return them and skip the API. Else one Google Places (New) `searchText` call (up to 20 results), resolve one keyless photo per place in parallel, insert new rows (dedupe by lowercased title), return.
- `logic.ts` — pure helpers: `MAX_LOCATION_LEN`, `isLocationAllowed`, `priceLevelNum` (maps Google `PRICE_LEVEL_*` enum → 1–4), `describe`, `PlacesApiPlace` type. Deno-tested in `logic_test.ts`.
- Google is the **sole** restaurant source. Foursquare is used **only** to fill null prices — it does **not** add restaurants.

## Changes

### 1. Paginate Google to ~60
- Raise `CACHE_TARGET` 20 → **60**.
- `fetchPlaces(loc)` loops `searchText` with `pageToken` up to **3 pages** (`pageSize: 20`), accumulating results; stop early when no `nextPageToken`. Google requires a short settle between page-token calls — retry the token page once on the "token not ready" error before giving up. Cap hard at 3 pages so cold-fetch cost is bounded.
- Photo resolution stays parallel per place (`Promise.all`), each wrapped (one bad photo → `image_url: null`).

### 2. Foursquare price fill
- New server-only env **`FOURSQUARE_API_KEY`** (never reaches the app; read via `Deno.env.get`). If unset, skip enrichment entirely (log a note) — never hard-fail.
- After Google mapping, take the subset with `price_level == null`. For each, call Foursquare Places Search:
  `GET https://api.foursquare.com/v3/places/search?query=<name>&near=<loc>&limit=1&fields=price`
  header `Authorization: <FOURSQUARE_API_KEY>`. Read `results[0].price` (1–4) → our tier directly (Foursquare 1=cheap … 4=most expensive, same scale). Leave null if no match/price.
- All lookups run **in parallel** via `Promise.all`, each wrapped in try/catch so one failure leaves that item null. Bound the set to the null-priced subset only (≤ ~40 per cold city).

### 3. No prewarm
- Existing cache-first stays. First opener of a city pays the (now larger) fetch; everyone after is served from cache. No cron, no seed script.

## Pure logic (put in `logic.ts`, deno-tested)

- `foursquarePrice(result: unknown): number | null` — validate + extract `price` in 1–4, else null.
- `mergeDedupe(pages: Place[][]): Place[]` — flatten Google pages, dedupe by lowercased title.
- `normalizeName(name: string): string` — used to build the Foursquare `query` (trim, drop obvious suffixes if helpful) — keep simple; a light normalize, not fuzzy matching.
- Extend `logic_test.ts`: price mapping (0/5/'x'/missing → null; 1–4 pass), dedupe across pages, name normalize.

## Security / cost

- `FOURSQUARE_API_KEY` server-side only. Location still restricted to the caller's room (`isLocationAllowed`). Pagination hard-capped at 3 pages; Foursquare bounded to null-priced subset → cost bounded and paid once per city (cache-first).
- No new table/column (`price_level` already exists). No migration.

## Verification

- `deno test supabase/functions/` (new + existing pass).
- Live probe **requires `FOURSQUARE_API_KEY`** (MANUAL_TODO). Without it, verify: pagination returns >20 for a fresh city; enrichment path is skipped cleanly when the key is unset (note in response, no error). With the key (once provided): a previously all-null city (e.g. Seattle) comes back with a higher priced share; confirm `count(*)` per city rises toward 60.
- `cached: true` path still short-circuits when `>= 60` stored.

## MANUAL_TODO (human-only)

- Provision `FOURSQUARE_API_KEY` (Foursquare developer account → Places API key), set as a Supabase Edge Function secret, redeploy `get-restaurants`.
