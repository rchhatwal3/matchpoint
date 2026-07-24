import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  MAX_LOCATION_LEN,
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
