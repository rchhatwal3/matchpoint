import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  MAX_LOCATION_LEN,
  isLocationAllowed,
  priceLevelNum,
  priceLabel,
  cuisineLabel,
  describe,
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
