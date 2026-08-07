import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  CACHE_TARGET,
  MAX_LOCATION_LEN,
  cacheVerdict,
  lookupRefusal,
  isLocationAllowed,
  normalizeLocation,
  priceLevelNum,
  priceLabel,
  cuisineLabel,
  describe,
  mergeDedupe,
  normalizeName,
  foursquarePrice,
  type Place,
} from './logic.ts';

// ---------------------------------------------------------------------------
// normalizeLocation — MIRROR TESTS
// ---------------------------------------------------------------------------
// These are the same cases as lib/location.test.ts, deliberately duplicated
// rather than shared: Deno cannot import from lib/, so the only way the two
// copies of normalizeLocation stay provably in step is for both suites to
// assert the same inputs and the same outputs. If you change one, change both,
// and change normalize_location(text) in 028_normalize_locations.sql with them —
// a divergence in any of the three re-splits the Places cache along that seam.

Deno.test('normalizeLocation trims leading and trailing whitespace of every kind', () => {
  assertEquals(normalizeLocation('  Seattle  '), 'Seattle');
  assertEquals(normalizeLocation('\t\nSeattle\n\t'), 'Seattle');
});

Deno.test('normalizeLocation collapses runs of internal whitespace to one space', () => {
  assertEquals(normalizeLocation('New    York'), 'New York');
  assertEquals(normalizeLocation('New\t\nYork'), 'New York');
});

Deno.test('normalizeLocation normalizes comma spacing to ", "', () => {
  assertEquals(normalizeLocation('Seattle,WA'), 'Seattle, WA');
  assertEquals(normalizeLocation('Seattle , WA'), 'Seattle, WA');
  assertEquals(normalizeLocation('Seattle ,WA'), 'Seattle, WA');
  assertEquals(normalizeLocation('Seattle,   WA'), 'Seattle, WA');
});

// The trim runs AFTER the comma rule, which is what makes this idempotent: the
// comma rule leaves a trailing space on a string that ends in a comma, and a
// second pass over an untrimmed result would not be a fixed point.
Deno.test('normalizeLocation leaves no trailing space on a string ending in a comma', () => {
  assertEquals(normalizeLocation('Seattle,'), 'Seattle,');
  assertEquals(normalizeLocation('Seattle, '), 'Seattle,');
});

Deno.test('normalizeLocation title-cases words and uppercases 1-2 character runs', () => {
  assertEquals(normalizeLocation('seattle, wa'), 'Seattle, WA');
  assertEquals(normalizeLocation('new york, ny'), 'New York, NY');
  assertEquals(normalizeLocation('SEATTLE, WA'), 'Seattle, WA');
  assertEquals(normalizeLocation('sEaTtLe'), 'Seattle');
});

// Cased per letter/digit run, not per space-separated word: a trailing comma is
// not part of the run, so `wa` is two characters whether or not one follows it.
Deno.test('normalizeLocation cases a 2-letter run the same with or without a comma', () => {
  assertEquals(normalizeLocation('seattle, wa, 98101'), 'Seattle, WA, 98101');
  assertEquals(normalizeLocation('d.c.'), 'D.C.');
});

// Documented consequence of the length rule, asserted so nobody "fixes" it by
// accident: `usa` is three characters, so it title-cases like any other word.
Deno.test('normalizeLocation title-cases runs longer than two characters, code or not', () => {
  assertEquals(normalizeLocation('seattle, wa, usa'), 'Seattle, WA, Usa');
});

Deno.test('normalizeLocation leaves punctuation other than commas alone', () => {
  assertEquals(normalizeLocation("coeur d'alene, id"), "Coeur D'Alene, ID");
  assertEquals(normalizeLocation('winston-salem, nc'), 'Winston-Salem, NC');
});

Deno.test('normalizeLocation handles digits in a location', () => {
  assertEquals(normalizeLocation('paris 11e'), 'Paris 11e');
  assertEquals(normalizeLocation('area 51'), 'Area 51');
});

// `[\p{L}\p{N}]` is the whole point of the unicode flag: an accented or
// non-latin city name must case like any other, not be left as an opaque blob.
Deno.test('normalizeLocation title-cases accented and non-latin city names', () => {
  assertEquals(normalizeLocation('são paulo, br'), 'São Paulo, BR');
  assertEquals(normalizeLocation('ZÜRICH'), 'Zürich');
  assertEquals(normalizeLocation('münchen,de'), 'München, DE');
  assertEquals(normalizeLocation('東京'), '東京');
});

// The empty result is load-bearing: index.ts checks emptiness on the NORMALIZED
// value, so this is what turns a whitespace-only body into a 400.
Deno.test('normalizeLocation returns an empty string for empty or whitespace-only input', () => {
  assertEquals(normalizeLocation(''), '');
  assertEquals(normalizeLocation('   '), '');
  assertEquals(normalizeLocation('\t\n '), '');
});

// Idempotence is what lets isLocationAllowed normalize an already-normalized
// room location for free, and what lets 028's trigger run over rows the client
// already normalized without churning them.
Deno.test('normalizeLocation is idempotent', () => {
  const inputs = [
    '  seattle ,  wa ',
    'Seattle, WA',
    'new york,ny',
    'são paulo, br',
    'Seattle,',
    '',
    '   ',
    "coeur d'alene, id",
    'seattle, wa, usa',
  ];
  for (const input of inputs) {
    const once = normalizeLocation(input);
    assertEquals(normalizeLocation(once), once);
  }
});

// The reason index.ts checks the length of the NORMALIZED string: comma spacing
// can only ever lengthen the input, by one character per comma. An 80-character
// raw string can therefore normalize past 80 and, unchecked, would reach the
// 80-char CHECK on items.location (025) as a 500 instead of this 400.
Deno.test('normalizing can push a string that fits MAX_LOCATION_LEN past it', () => {
  const raw = 'a'.repeat(MAX_LOCATION_LEN - 3) + ',bb';
  assertEquals(raw.length, MAX_LOCATION_LEN);
  assertEquals(normalizeLocation(raw).length, MAX_LOCATION_LEN + 1);
});

Deno.test('isLocationAllowed matches a room location case/space-insensitively', () => {
  const allowed = ['New York', '  Chicago  '];
  assertEquals(isLocationAllowed('new york', allowed), true);
  assertEquals(isLocationAllowed('chicago', allowed), true);
  assertEquals(isLocationAllowed('Boston', allowed), false);
});

// The property that makes the deploy order of 028 free either way. A room row
// still holding a raw spelling — this function deployed but 028's trigger and
// backfill not yet applied — must still authorize the caller's normalized
// request, or every restaurant deck for that room 403s until the migration runs.
Deno.test('isLocationAllowed matches an un-normalized room row against a normalized request', () => {
  assertEquals(isLocationAllowed('Seattle, WA', ['seattle,wa']), true);
  assertEquals(isLocationAllowed('Seattle, WA', ['SEATTLE , WA']), true);
  assertEquals(isLocationAllowed('New York, NY', ['new york ,ny']), true);
  // And it does NOT start matching places that merely look similar.
  assertEquals(isLocationAllowed('Seattle, WA', ['Seattle']), false);
  assertEquals(isLocationAllowed('Portland, OR', ['Portland, ME']), false);
});

Deno.test('isLocationAllowed rejects when the room has no locations', () => {
  assertEquals(isLocationAllowed('New York', []), false);
});

Deno.test('an over-long location exceeds MAX_LOCATION_LEN', () => {
  assertEquals('x'.repeat(MAX_LOCATION_LEN + 1).length > MAX_LOCATION_LEN, true);
  assertEquals('New York'.length > MAX_LOCATION_LEN, false);
});

// null is the ONLY value that lets the handler reach the Places call, so it must
// be reachable by exactly one input: the RPC succeeding and returning 'ok'.
Deno.test('lookupRefusal authorizes the spend only on a clean ok', () => {
  assertEquals(lookupRefusal({ data: 'ok' }), null);
  assertEquals(lookupRefusal({ data: 'ok', error: null }), null);
});

// Two different causes, two different things to tell the user: one is "you spent
// your own budget", the other is "the app as a whole is at capacity". Neither may
// collapse into the generic 500 failure message, or the honest user is told the
// app is broken when it is actually rate-limiting them.
Deno.test('lookupRefusal renders each budget verdict as its own distinct 429', () => {
  const user = lookupRefusal({ data: 'user_limit' });
  const global = lookupRefusal({ data: 'global_limit' });
  assertEquals(user, {
    status: 429,
    error: 'Daily restaurant search limit reached. Try again tomorrow.',
  });
  assertEquals(global, {
    status: 429,
    error: 'Restaurant search is busy right now. Try again later.',
  });
  assertEquals(user!.error === global!.error, false);
  assertEquals([user!.error, global!.error].includes('Could not load restaurants'), false);
});

// The property the whole fix rests on: anything the RPC can return other than a
// recognised verdict has bounded no spend, so it must refuse rather than fall
// through to the upstream call. An unknown verdict string is the case the SQL
// function could produce if it ever grew a return value the handler lags behind.
Deno.test('lookupRefusal fails closed on an unrecognised verdict', () => {
  const closed = { status: 500, error: 'Could not load restaurants' };
  assertEquals(lookupRefusal({ data: 'maybe' }), closed);
  assertEquals(lookupRefusal({ data: 'OK' }), closed);
  assertEquals(lookupRefusal({ data: '' }), closed);
  assertEquals(lookupRefusal({ data: null }), closed);
  assertEquals(lookupRefusal({}), closed);
  assertEquals(lookupRefusal({ data: true }), closed);
  assertEquals(lookupRefusal({ data: 0 }), closed);
  assertEquals(lookupRefusal({ data: { verdict: 'ok' } }), closed);
  assertEquals(lookupRefusal({ data: ['ok'] }), closed);
});

// A raised RPC — function not deployed yet, places_budget row missing, dead
// connection — refuses too, and an error outranks even an 'ok' payload.
Deno.test('lookupRefusal fails closed on an RPC error', () => {
  const closed = { status: 500, error: 'Could not load restaurants' };
  assertEquals(lookupRefusal({ error: { message: 'places_budget_unconfigured' } }), closed);
  assertEquals(lookupRefusal({ data: null, error: { message: 'boom' } }), closed);
  assertEquals(lookupRefusal({ data: 'ok', error: { message: 'boom' } }), closed);
});

// The regression itself. Before 027 the whole rule was `count >= CACHE_TARGET`,
// so a location the providers only have 59 results for went upstream on every
// single request, forever — "New York, NY" was live proof at 59. The marker is
// what breaks that loop, and nothing else about the short-circuit changed.
Deno.test('cacheVerdict serves a sparse location once its fetch has been recorded', () => {
  assertEquals(cacheVerdict(59, {}), 'fetch');
  assertEquals(cacheVerdict(59, { data: 'fresh' }), 'serve');
});

Deno.test('cacheVerdict serves a full cache without consulting the marker', () => {
  assertEquals(cacheVerdict(CACHE_TARGET, {}), 'serve');
  assertEquals(cacheVerdict(CACHE_TARGET + 1, { data: 'miss' }), 'serve');
  assertEquals(cacheVerdict(CACHE_TARGET, { error: { message: 'boom' } }), 'serve');
});

// A location that genuinely has nothing — a typo'd or nonsense location string —
// is the case that burns the most budget for the least value, so a recorded
// empty fetch has to short-circuit too. Serving zero items is correct here: the
// app renders its empty state, and it stops paying Google to confirm it.
Deno.test('cacheVerdict serves a recorded empty location rather than re-fetching it', () => {
  assertEquals(cacheVerdict(0, { data: 'fresh' }), 'serve');
  assertEquals(cacheVerdict(0, { data: 'miss' }), 'fetch');
});

// The mirror image of lookupRefusal's fail-closed, and it must stay this way
// round: an unreadable or unrecognised marker has vouched for nothing, so
// serving on it would invent a cache hit and could blank a deck for a whole TTL.
// Fetching instead is the pre-027 behaviour, still behind the budget.
Deno.test('cacheVerdict falls back to fetching on any marker it cannot trust', () => {
  const unusable = [
    { error: { message: 'places_cache_verdict does not exist' } },
    { data: 'fresh', error: { message: 'boom' } },
    { data: 'stale' },
    { data: 'FRESH' },
    { data: '' },
    { data: null },
    { data: true },
    { data: 1 },
    { data: { verdict: 'fresh' } },
    { data: ['fresh'] },
    {},
  ];
  for (const marker of unusable) {
    assertEquals(cacheVerdict(CACHE_TARGET - 1, marker), 'fetch');
  }
});

Deno.test('priceLevelNum maps every Places enum, null otherwise', () => {
  assertEquals(priceLevelNum('PRICE_LEVEL_INEXPENSIVE'), 1);
  assertEquals(priceLevelNum('PRICE_LEVEL_MODERATE'), 2);
  assertEquals(priceLevelNum('PRICE_LEVEL_EXPENSIVE'), 3);
  assertEquals(priceLevelNum('PRICE_LEVEL_VERY_EXPENSIVE'), 4);
  assertEquals(priceLevelNum(undefined), null);
  assertEquals(priceLevelNum('PRICE_LEVEL_UNSPECIFIED'), null);
});

Deno.test('priceLabel maps enums to $ signs', () => {
  assertEquals(priceLabel('PRICE_LEVEL_INEXPENSIVE'), '$');
  assertEquals(priceLabel('PRICE_LEVEL_VERY_EXPENSIVE'), '$$$$');
  assertEquals(priceLabel(undefined), null);
});

Deno.test('cuisineLabel picks the first food-ish type and titlecases it', () => {
  assertEquals(cuisineLabel(['point_of_interest', 'italian_restaurant']), 'Italian Restaurant');
  assertEquals(cuisineLabel(['cafe']), 'Cafe');
  assertEquals(cuisineLabel(['park', 'store']), null);
  assertEquals(cuisineLabel(undefined), null);
});

Deno.test('describe joins cuisine, rating and price; null when nothing known', () => {
  assertEquals(
    describe({ types: ['italian_restaurant'], rating: 4.6, priceLevel: 'PRICE_LEVEL_MODERATE' }),
    'Italian Restaurant · 4.6★ · $$',
  );
  assertEquals(describe({}), null);
});

function place(title: string): Place {
  return { title, subtitle: null, image_url: null, price_level: null };
}

Deno.test('mergeDedupe flattens pages and dedupes by lowercased title, keeping first', () => {
  const page1 = [place('Joe'), place('Bar')];
  const page2 = [place('joe'), place('Cafe')];
  const merged = mergeDedupe([page1, page2]);
  assertEquals(
    merged.map((p) => p.title),
    ['Joe', 'Bar', 'Cafe'],
  );
});

Deno.test('mergeDedupe handles no pages / empty pages', () => {
  assertEquals(mergeDedupe([]), []);
  assertEquals(mergeDedupe([[], []]), []);
});

Deno.test('normalizeName trims and collapses internal whitespace', () => {
  assertEquals(normalizeName('  Joe   Bar  '), 'Joe Bar');
  assertEquals(normalizeName('Cafe'), 'Cafe');
  assertEquals(normalizeName('Multi\n\tSpace'), 'Multi Space');
});

Deno.test('foursquarePrice extracts a valid 1-4 integer, else null', () => {
  assertEquals(foursquarePrice({ price: 1 }), 1);
  assertEquals(foursquarePrice({ price: 4 }), 4);
  assertEquals(foursquarePrice({ price: 0 }), null);
  assertEquals(foursquarePrice({ price: 5 }), null);
  assertEquals(foursquarePrice({ price: 'x' }), null);
  assertEquals(foursquarePrice({}), null);
  assertEquals(foursquarePrice(null), null);
  assertEquals(foursquarePrice(undefined), null);
});
