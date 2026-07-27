import { PRICE_TIERS, allPriceTiers, normalizePriceTiers } from './price-filter';

describe('price-filter', () => {
  it('allPriceTiers selects every tier including unpriced (0)', () => {
    expect(allPriceTiers()).toEqual(new Set(PRICE_TIERS));
    expect(allPriceTiers().has(0)).toBe(true);
  });

  it('normalize keeps a valid subset from a DB int[]', () => {
    expect(normalizePriceTiers([2, 3])).toEqual(new Set([2, 3]));
    expect(normalizePriceTiers([0, 1, 2, 3, 4])).toEqual(allPriceTiers());
  });

  it('normalize drops junk tiers but keeps valid ones', () => {
    expect(normalizePriceTiers([2, 99, -1, 1.5])).toEqual(new Set([2]));
  });

  it('normalize falls back to all tiers for null, undefined, empty, or all-junk', () => {
    expect(normalizePriceTiers(null)).toEqual(allPriceTiers());
    expect(normalizePriceTiers(undefined)).toEqual(allPriceTiers());
    expect(normalizePriceTiers([])).toEqual(allPriceTiers());
    expect(normalizePriceTiers([7, 8])).toEqual(allPriceTiers());
  });
});
