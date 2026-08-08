import { readFileSync } from 'fs';
import { join } from 'path';

import { CITY_SUGGESTIONS } from './cities';
import { hasRegion, normalizeLocation } from './location';

/**
 * The bare-city mapping in 032_backfill_bare_city_locations.sql, checked here.
 *
 * That migration corrects the regionless locations 031 deliberately left
 * grandfathered, using an explicit `bare -> canonical` table rather than any
 * inference. Its section 1 asserts, in a DO block that aborts before touching
 * data, that every canonical value is a fixed point of normalize_location and
 * satisfies has_location_region, and that every bare key is a fixed point with
 * NO region.
 *
 * Those assertions only ever run when a human pastes the file into the Supabase
 * SQL editor — there is no Postgres in CI or on a laptop. This suite runs the
 * SAME checks against the TypeScript mirrors (normalizeLocation / hasRegion in
 * lib/location.ts), which 028 and 031 both assert are byte-for-byte equivalent
 * to the SQL ones, so a typo in the mapping fails `npx jest` instead of failing
 * at 2am halfway through an apply.
 *
 * It parses the pairs out of the .sql file rather than duplicating them, so
 * there is exactly one copy of the mapping and this cannot drift from it. If the
 * INSERT is ever reformatted so a pair no longer sits on one line, the count
 * assertion below fails rather than the suite silently checking nothing.
 */
const SQL_PATH = join(__dirname, '..', 'supabase', 'migrations', '032_backfill_bare_city_locations.sql');

function parseMapping(): { bare: string; canonical: string }[] {
  const sql = readFileSync(SQL_PATH, 'utf8');
  const start = sql.indexOf('INSERT INTO bare_city_location_map (bare, canonical) VALUES');
  expect(start).toBeGreaterThan(-1);
  const block = sql.slice(start, sql.indexOf(';', start));
  return [...block.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)].map((m) => ({
    bare: m[1],
    canonical: m[2],
  }));
}

const MAPPING = parseMapping();

describe('032 bare-city mapping', () => {
  it('parses as a non-trivial list of pairs', () => {
    expect(MAPPING.length).toBe(18);
  });

  // 031:53-55 names these three as locations that actually exist in live rows.
  // They are the reason the migration exists, so their absence is a bug even if
  // everything else about the list is well-formed.
  it('covers the bare cities 031 recorded as live data', () => {
    const bare = MAPPING.map((m) => m.bare);
    expect(bare).toContain('Portland');
    expect(bare).toContain('Seattle');
    expect(bare).toContain('New Orleans');
  });

  // The owner's decision, pinned. `Portland, ME` is an equally real city and is
  // in CITY_SUGGESTIONS too; this line is the record that Oregon was chosen
  // rather than derived.
  it('resolves Portland to Oregon, as decided', () => {
    expect(MAPPING.find((m) => m.bare === 'Portland')?.canonical).toBe('Portland, OR');
  });

  it('every canonical value is already canonical', () => {
    const changed = MAPPING.filter((m) => normalizeLocation(m.canonical) !== m.canonical);
    expect(changed).toEqual([]);
  });

  it('every canonical value carries a region', () => {
    const regionless = MAPPING.filter((m) => !hasRegion(m.canonical));
    expect(regionless).toEqual([]);
  });

  // The migration matches stored values as `normalize_location(stored) = bare`,
  // so a key that is not itself canonical can never match anything and would
  // silently correct nothing.
  it('every bare key is already canonical', () => {
    const changed = MAPPING.filter((m) => normalizeLocation(m.bare) !== m.bare);
    expect(changed).toEqual([]);
  });

  it('no bare key already carries a region', () => {
    const withRegion = MAPPING.filter((m) => hasRegion(m.bare));
    expect(withRegion).toEqual([]);
  });

  it('no entry maps to itself', () => {
    expect(MAPPING.filter((m) => m.bare === m.canonical)).toEqual([]);
  });

  it('has no duplicate keys and no duplicate targets', () => {
    const bare = MAPPING.map((m) => m.bare);
    const canonical = MAPPING.map((m) => m.canonical);
    expect(bare.filter((b, i) => bare.indexOf(b) !== i)).toEqual([]);
    expect(canonical.filter((c, i) => canonical.indexOf(c) !== i)).toEqual([]);
  });

  // items.location's CHECK (025) and places_fetches.location's (027) both cap at
  // 80. The items one is NOT VALID, so it is not enforced at rest but IS
  // enforced on the UPDATE the migration runs — an over-long value would abort
  // the apply mid-transaction.
  it('every canonical value fits the 80-character location cap', () => {
    expect(MAPPING.filter((m) => m.canonical.length > 80)).toEqual([]);
  });

  // A corrected room must end up holding the value the picker would produce, not
  // a second spelling of it — otherwise the backfill creates the very cache
  // split 028 exists to close.
  it('every canonical value is one the city picker offers', () => {
    const missing = MAPPING.filter((m) => !CITY_SUGGESTIONS.includes(m.canonical));
    expect(missing).toEqual([]);
  });
});
