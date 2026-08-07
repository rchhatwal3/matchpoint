// Pure helpers for the get-restaurants edge function. Kept in a side-effect-free
// module (no Deno.serve) so they can be unit-tested with `deno test`.

// Upper bound on a city-level location string. Anything longer is not a real
// place name — rejecting it bounds the Places query and blocks abuse via
// oversized input.
export const MAX_LOCATION_LEN = 80;

// Canonical form for a free-text location string. Byte-for-byte identical in
// behaviour to normalizeLocation in lib/location.ts (Deno cannot import from
// lib/, so this is a deliberate copy) and to normalize_location(text) in
// supabase/migrations/028_normalize_locations.sql. All three must change
// together or the Places cache splits again along the seam.
//
// Why: every distinct spelling is its own `.eq('location', loc)` cache bucket
// below, so `Seattle`, `seattle` and `Seattle,WA` each spend a separate Places
// lookup and insert a parallel set of `items` rows. 023's global ceiling bounds
// the bill but not the waste.
//
// Deterministic only — no geocoding, no requiring a region, and `Seattle` is
// NOT resolved to `Seattle, WA`. Idempotent: f(f(x)) === f(x).
//   1. collapse whitespace runs to one space
//   2. comma spacing -> ", "
//   3. trim (AFTER step 2, which can leave a trailing space on a string ending
//      in a comma — that ordering is what makes this idempotent)
//   4. Title Case each letter/digit run, except runs of 1-2 characters which
//      uppercase whole, so `wa` -> `WA` and `ny` -> `NY`
//
// Cased per letter/digit run rather than per space-separated word so a trailing
// comma cannot change a token's length: `seattle, wa, 98101` -> `Seattle, WA,
// 98101`. `[\p{L}\p{N}]` is the JS spelling of Postgres' `[[:alnum:]]` under a
// UTF-8 ctype, which is what the SQL mirror matches on.
//
// No length cap in here: MAX_LOCATION_LEN is checked by the caller against the
// NORMALIZED value, because step 2 can lengthen a string by one character per
// comma. Truncating silently here would hide that rejection instead.
const WORD_RUN = /[\p{L}\p{N}]+/gu;

export function normalizeLocation(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim()
    .replace(WORD_RUN, (run) =>
      run.length <= 2 ? run.toUpperCase() : run[0].toUpperCase() + run.slice(1).toLowerCase(),
    );
}

// True when `loc` is one of the caller's room locations. The T16 guard: only
// locations the pair saved can trigger a Places lookup.
//
// Both sides go through normalizeLocation, which subsumes the old trim +
// lowercase comparison and additionally makes the guard survive the window
// where this function is deployed but 028's rooms trigger is not yet applied:
// a room row still holding `Seattle,WA` would otherwise no longer match the
// caller's normalized `Seattle, WA` and every request for it would 403.
// Normalizing `loc` a second time here is free — it is idempotent.
export function isLocationAllowed(loc: string, allowed: string[]): boolean {
  const want = normalizeLocation(loc);
  return allowed.some((l) => normalizeLocation(l) === want);
}

// Cost budget. The room-locations guard above is self-authorizing — members may
// UPDATE rooms.locations — so it cannot bound spend on its own. The counting,
// the limits and the window all live in the spend_places_lookup SQL function
// (023), because only there can the count and the row that spends it share one
// locked transaction. All that is left here is rendering its verdict.
export type LookupRefusal = { status: number; error: string };

// Decides the whole spend outcome from the RPC result, so BOTH fail-closed
// branches are one testable expression rather than one being an `if` in the
// handler. null = spend authorized, proceed upstream; anything else is the
// response to return instead of calling Places.
//
// Fails closed twice over. A raised RPC (missing function, unconfigured budget,
// dead connection) bounded nothing, and neither did a verdict this function does
// not recognise — in both cases the only safe answer is to refuse, never to bill.
export function lookupRefusal(res: { data?: unknown; error?: unknown }): LookupRefusal | null {
  if (res.error) return { status: 500, error: 'Could not load restaurants' };
  switch (res.data) {
    case 'ok':
      return null;
    case 'user_limit':
      return { status: 429, error: 'Daily restaurant search limit reached. Try again tomorrow.' };
    case 'global_limit':
      return { status: 429, error: 'Restaurant search is busy right now. Try again later.' };
    default:
      return { status: 500, error: 'Could not load restaurants' };
  }
}

// How many stored rows count as "already cached" for a location — at/above
// this we skip the API entirely and serve what we have.
export const CACHE_TARGET = 60;

// Whether the stored rows may be served as-is, or the location has to go
// upstream. 'serve' is the only value that avoids an API call and a budget spend.
export type CacheVerdict = 'serve' | 'fetch';

// The cache short-circuit, whole. It used to be `count >= CACHE_TARGET` alone,
// which asks the wrong question: a location the providers only have 59 results
// for never reaches 60, so every request for it missed the cache and went
// upstream, forever (the P2 from the 2026-08-03 QA — "New York, NY" was live
// proof at 59). The count cannot tell "not fetched yet" from "fetched, and this
// is all there is". The second fact is what places_fetches records and what
// `marker` carries here, as the raw result of the places_cache_verdict RPC (027).
//
// Fails toward 'fetch', which is the opposite direction from lookupRefusal above
// and deliberately so. An unreadable marker has vouched for nothing, so serving
// on it would be inventing a cache hit; fetching instead is exactly the
// behaviour that shipped before 027, still bounded by the budget that runs after
// this. Being wrong here costs one lookup — being wrong the other way blanks a
// deck until the TTL expires.
export function cacheVerdict(
  count: number,
  marker: { data?: unknown; error?: unknown },
): CacheVerdict {
  if (count >= CACHE_TARGET) return 'serve';
  if (marker.error) return 'fetch';
  return marker.data === 'fresh' ? 'serve' : 'fetch';
}

export type PlacesApiPlace = {
  displayName?: { text?: string };
  rating?: number;
  priceLevel?: string;
  types?: string[];
  userRatingCount?: number;
  photos?: { name?: string }[];
};

// Places `priceLevel` enum -> 1–4 (same source as the $/$$ subtitle label).
export function priceLevelNum(level?: string): number | null {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 1;
    case 'PRICE_LEVEL_MODERATE':
      return 2;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 4;
    default:
      return null;
  }
}

export function priceLabel(level?: string): string | null {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE':
      return '$';
    case 'PRICE_LEVEL_MODERATE':
      return '$$';
    case 'PRICE_LEVEL_EXPENSIVE':
      return '$$$';
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return '$$$$';
    default:
      return null;
  }
}

// Map the first food-related Places type to a friendly cuisine/venue label.
export function cuisineLabel(types?: string[]): string | null {
  if (!types) return null;
  for (const t of types) {
    if (t.endsWith('_restaurant') || t === 'restaurant' || t === 'cafe' || t === 'bar') {
      return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return null;
}

// Own-words descriptor synthesized from structured fields (never copied prose):
// e.g. "Italian restaurant · 4.6★ · $$".
export function describe(p: PlacesApiPlace): string | null {
  const parts: string[] = [];
  const cuisine = cuisineLabel(p.types);
  if (cuisine) parts.push(cuisine);
  if (typeof p.rating === 'number') parts.push(`${p.rating.toFixed(1)}★`);
  const price = priceLabel(p.priceLevel);
  if (price) parts.push(price);
  return parts.length ? parts.join(' · ') : null;
}

export type Place = {
  title: string;
  subtitle: string | null;
  image_url: string | null;
  price_level: number | null;
};

// Flatten paginated Google results into one list, deduping by lowercased
// title (first occurrence wins) — the same dedupe rule already used against
// stored rows.
export function mergeDedupe(pages: Place[][]): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const page of pages) {
    for (const p of page) {
      const key = p.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

// Light normalization for the Foursquare query string — trim + collapse
// internal whitespace. Not fuzzy matching, just a clean query term.
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

// Extract a valid Foursquare price tier (1–4) from one `results[]` entry of
// a Places Search response. Anything malformed or out of range -> null so
// the caller just leaves that item unenriched.
export function foursquarePrice(result: unknown): number | null {
  if (typeof result !== 'object' || result === null) return null;
  const price = (result as { price?: unknown }).price;
  if (typeof price !== 'number' || !Number.isInteger(price)) return null;
  if (price < 1 || price > 4) return null;
  return price;
}
