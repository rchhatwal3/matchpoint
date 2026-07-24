import {
  PRICE_TIERS,
  allPriceTiers,
  parsePriceTiers,
  serializePriceTiers,
} from './price-filter';

describe('price-filter', () => {
  it('allPriceTiers selects every tier including unpriced (0)', () => {
    expect(allPriceTiers()).toEqual(new Set(PRICE_TIERS));
    expect(allPriceTiers().has(0)).toBe(true);
  });

  it('serialize produces a sorted csv of valid tiers only', () => {
    expect(serializePriceTiers(new Set([4, 0, 2]))).toBe('0,2,4');
    expect(serializePriceTiers(new Set([1, 2, 3, 4, 0]))).toBe('0,1,2,3,4');
    expect(serializePriceTiers(new Set([2, 99, -1]))).toBe('2');
  });

  it('round-trips through serialize → parse', () => {
    const set = new Set([0, 3]);
    expect(parsePriceTiers(serializePriceTiers(set))).toEqual(set);
  });

  it('parse drops junk tokens', () => {
    expect(parsePriceTiers('1,foo,3,9')).toEqual(new Set([1, 3]));
  });

  it('parse falls back to all tiers for null, empty, or all-junk', () => {
    expect(parsePriceTiers(null)).toEqual(allPriceTiers());
    expect(parsePriceTiers('')).toEqual(allPriceTiers());
    expect(parsePriceTiers('foo,bar')).toEqual(allPriceTiers());
  });
});
