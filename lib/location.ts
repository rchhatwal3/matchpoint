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
// than on space-separated words is what makes `seattle, wa, 98101` come out as
// `Seattle, WA, 98101` — a trailing comma does not change a token's length.
// `[\p{L}\p{N}]` is the JS spelling of Postgres' `[[:alnum:]]` under a UTF-8
// ctype, which is what the SQL mirror uses.
const WORD_RUN = /[\p{L}\p{N}]+/gu;

// Words that stay lowercase inside a name — but only when something precedes
// them in their comma part, so `Rio de Janeiro` and `Isle of Man` keep the
// lowercase joiner while `The Dalles`, `De Pere` and `Las Vegas` keep their
// leading capital. Checked BEFORE the region-code rule below, which is what
// keeps a middle part like `Île de France` from coming out as `Île DE France`;
// a real region code is the first run of its part, so it never reaches here.
//
// KEPT DELIBERATELY SHORT. The Spanish articles `la`/`las`/`los` were in this
// list and produced `North las Vegas` — in English place names those words are
// capitalised wherever they fall, and `Las Vegas` only looked right because it
// opens its part. `van`/`von`/`der`/`den`/`le`/`les`/`da`/`do`/`dos` came out
// for the same reason: each one risks lowercasing a word an English name
// capitalises, to fix a case no location in this app has. A wrong entry here is
// worse than a missing one — a missing one leaves a name Title Cased, which is
// merely plain, while a wrong one mangles a real city.
const SMALL_WORDS = new Set(['de', 'del', 'du', 'di', 'of', 'the', 'and', 'upon']);

// `Mc` + at least two more letters: `mckinney` -> `McKinney`, `mcallen` ->
// `McAllen`. Deliberately NOT extended to `Mac` — `Macon` and `Madison` also
// begin `Mac` + two letters, and no string-shape rule separates them from
// `MacArthur`. Distinguishing them needs a name list, which is semantics, and
// this function is deterministic string shape only. `Mc` has no such collision:
// `mc` is not a syllable onset in ordinary words.
const MC_PREFIX = /^mc\p{L}{2,}$/iu;

/**
 * Case one letter/digit run.
 *
 * `firstPart` / `firstRun` are the run's position: which comma part it is in,
 * and whether anything precedes it inside that part. Both rules that are not
 * plain Title Case are positional, because position is the only deterministic
 * evidence available — `WA` is a region code because it sits after the comma,
 * not because this function knows what Washington is.
 */
function caseRun(run: string, firstPart: boolean, firstRun: boolean): string {
  const lower = run.toLowerCase();
  if (!firstRun && SMALL_WORDS.has(lower)) return lower;
  if (!firstPart && run.length <= 2) return run.toUpperCase();
  if (MC_PREFIX.test(run)) return 'Mc' + run[2].toUpperCase() + run.slice(3).toLowerCase();
  return run[0].toUpperCase() + lower.slice(1);
}

/**
 * Canonicalize one location string. Idempotent: `f(f(x)) === f(x)`.
 *
 * 1. collapse every run of whitespace to a single space
 * 2. normalize comma spacing to `", "`
 * 3. trim (step 2 can leave a trailing space on a string ending in a comma —
 *    trimming after it, not before, is what keeps this idempotent)
 * 4. case each letter/digit run, PER COMMA PART, by the rules in caseRun:
 *    small word -> lowercase, 1–2 characters outside the first part ->
 *    uppercase whole, `Mc`-prefixed -> `McKinney`, everything else Title Case
 *
 * Step 4 is per part because the whole-uppercase rule exists for ONE reason —
 * preserving region codes (`WA`, `NY`, `DC`, `UK`) — and those live after the
 * first comma. Applying it everywhere is what used to produce `EL Paso`,
 * `Santa FE`, `HO Chi Minh City` and `ST. Petersburg`, all of which are shown
 * to the user as-is in Settings.
 *
 * The first part is excluded rather than "every part but the last" so that
 * `seattle, wa, usa` still gives `Seattle, WA, Usa`: in `city, region, country`
 * the code is in the middle. The city is always the first part, and that is
 * where every mangled example above sits.
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
    .split(',')
    .map((part, i) => {
      let runs = 0;
      return part.replace(WORD_RUN, (run) => caseRun(run, i === 0, runs++ === 0));
    })
    .join(',');
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
