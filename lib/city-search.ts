/**
 * Matching for the "Add a city" autocomplete. Pure and bundled — no network,
 * no third-party call, works in offline demo mode (CLAUDE.md forbids the
 * frontend calling third-party APIs at runtime, and Places Autocomplete bills
 * per session, which is the cost this whole feature exists to avoid).
 *
 * Suggestions only. Nothing here validates: a city missing from CITY_SUGGESTIONS
 * is still typeable by hand as long as it carries a region (hasRegion).
 */
import { CITY_SUGGESTIONS } from './cities';
import { normalizeLocation } from './location';

/** How many suggestions the field shows by default. */
export const MAX_CITY_SUGGESTIONS = 6;

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Case- and accent-insensitive comparison form. `Zürich` and `zurich` fold to
 * the same thing, so a user typing either finds the entry spelled the other way.
 * NFD splits an accented letter into base + combining mark; dropping the marks
 * leaves the base letter.
 */
function fold(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

const ALNUM = /[\p{L}\p{N}]/u;

/**
 * How well `q` matches `folded`, lower is better, null for no match:
 *   0 — the entry starts with the query (`sea` -> `Seattle, WA`)
 *   1 — a word inside the entry starts with it (`york` -> `New York, NY`,
 *       `wa` -> `Seattle, WA`)
 *   2 — it appears mid-word (`ork` -> `New York, NY`)
 * Every occurrence is considered, not just the first, so `an` ranks `Santa Ana`
 * at 1 (the `Ana`) rather than 2 (the `an` inside `Santa`).
 *
 * Scanned with indexOf rather than a built regex because the query is user
 * input — a stray `(` or `*` would otherwise have to be escaped, and forgetting
 * to is a crash on every keystroke.
 */
function rank(folded: string, q: string): number | null {
  let best: number | null = null;
  for (let i = folded.indexOf(q); i !== -1; i = folded.indexOf(q, i + 1)) {
    const r = i === 0 ? 0 : ALNUM.test(folded[i - 1]) ? 2 : 1;
    if (best === null || r < best) best = r;
    if (best === 0) break;
  }
  return best;
}

/**
 * Suggestions for what the user has typed so far, best first, capped.
 *
 * The query goes through normalizeLocation first, so comma spacing cannot cost
 * a match: `seattle,wa` and `seattle, wa` both find `Seattle, WA`, which matters
 * because the entries are stored with the canonical `, ` spacing.
 *
 * Ties keep the order of CITY_SUGGESTIONS, which is roughly by population, so
 * `new` offers New York before Newark. An empty query returns nothing — the
 * field shows the list only once the user starts typing.
 */
export function searchCities(query: string, limit: number = MAX_CITY_SUGGESTIONS): string[] {
  // A query with no letter or digit in it — `,` or `.` on its own — is not a
  // search. Without this it would substring-match every entry containing that
  // character, so typing the comma of `Seattle, WA` would briefly offer the
  // whole list.
  const q = fold(normalizeLocation(query));
  if (!ALNUM.test(q)) return [];
  const hits: { city: string; rank: number; index: number }[] = [];
  CITY_SUGGESTIONS.forEach((city, index) => {
    const r = rank(fold(city), q);
    if (r !== null) hits.push({ city, rank: r, index });
  });
  hits.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return hits.slice(0, limit).map((h) => h.city);
}
