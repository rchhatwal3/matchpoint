import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  CACHE_TARGET,
  MAX_LOCATION_LEN,
  cacheVerdict,
  lookupRefusal,
  isLocationAllowed,
  priceLevelNum,
  priceLabel,
  cuisineLabel,
  describe,
  mergeDedupe,
  normalizeName,
  foursquarePrice,
  type Place,
} from './logic.ts';

Deno.test('isLocationAllowed matches a room location case/space-insensitively', () => {
  const allowed = ['New York', '  Chicago  '];
  assertEquals(isLocationAllowed('new york', allowed), true);
  assertEquals(isLocationAllowed('chicago', allowed), true);
  assertEquals(isLocationAllowed('Boston', allowed), false);
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
