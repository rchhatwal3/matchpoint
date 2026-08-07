/**
 * Canonical form for the free-text location strings a pair saves on their room
 * and that `items.location` is tagged with.
 *
 * Why this exists: every distinct spelling is its own paid cache bucket.
 * `Seattle`, `seattle`, `Seattle,WA` and `Seattle , WA` each miss the
 * `.eq('location', loc)` cache in get-restaurants, so each one spends a Places
 * lookup and inserts a parallel set of `items` rows. `023`'s global ceiling
 * bounds the resulting bill but not the waste.
 *
 * Deliberately DETERMINISTIC ONLY — string shape, nothing semantic. It does not
 * geocode, does not require a region, and does not resolve `Seattle` to
 * `Seattle, WA`. Those merge two places a user may have meant differently and
 * are a product decision, not a formatting one.
 *
 * MIRRORED, byte-for-byte in behaviour, in three places. All three must change
 * together or the cache splits again along the seam:
 *   - here (client write path, providers/SessionProvider.tsx)
 *   - supabase/functions/get-restaurants/logic.ts  (Deno cannot import from lib/)
 *   - normalize_location(text) in supabase/migrations/028_normalize_locations.sql
 *     (the server-side backstop: members hold a column UPDATE grant on
 *     rooms.locations, so a raw PATCH can bypass this module entirely)
 */

// Runs of letters/digits are what gets cased; everything else (commas, dots,
// hyphens, apostrophes) is passed through untouched. Matching on runs rather
// than on space-separated words is what makes `seattle, wa, usa` come out as
// `Seattle, WA, USA` — a trailing comma does not change a token's length.
// `[\p{L}\p{N}]` is the JS spelling of Postgres' `[[:alnum:]]` under a UTF-8
// ctype, which is what the SQL mirror uses.
const WORD_RUN = /[\p{L}\p{N}]+/gu;

/**
 * Canonicalize one location string. Idempotent: `f(f(x)) === f(x)`.
 *
 * 1. collapse every run of whitespace to a single space
 * 2. normalize comma spacing to `", "`
 * 3. trim (step 2 can leave a trailing space on a string ending in a comma —
 *    trimming after it, not before, is what keeps this idempotent)
 * 4. Title Case each letter/digit run, except runs of 1–2 characters which
 *    uppercase whole, so state and country codes survive as `WA` / `NY` / `UK`
 *
 * No length cap here on purpose. The 80-char cap (MAX_LOCATION_LEN) is the edge
 * function's input guard and a CHECK on items.location (025); no client call
 * site truncates today, and silently shortening a city name here would hide
 * that rejection rather than surface it.
 */
export function normalizeLocation(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim()
    .replace(WORD_RUN, (run) =>
      run.length <= 2 ? run.toUpperCase() : run[0].toUpperCase() + run.slice(1).toLowerCase(),
    );
}

/**
 * The room-locations list, canonicalized: normalize each entry, drop the ones
 * that normalize to nothing, and dedupe. The dedupe is exact rather than
 * case-insensitive because normalizeLocation has already fixed the case — two
 * entries that differ only in case are now literally equal. First occurrence
 * wins, so the user's ordering is preserved.
 */
export function normalizeLocations(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = normalizeLocation(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
