import { PRICE_TIERS, allPriceTiers, nextPriceTiers, normalizePriceTiers } from './price-filter';

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

  it('nextPriceTiers turns a selected level off, leaving the rest', () => {
    expect(nextPriceTiers([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('nextPriceTiers turns an unselected level on, adding it', () => {
    expect(nextPriceTiers([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it('nextPriceTiers refuses to turn off the last remaining level', () => {
    expect(nextPriceTiers([2], 2)).toBeNull();
  });
});
