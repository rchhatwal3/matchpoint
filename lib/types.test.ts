import { CATEGORIES, CATEGORY_LABELS, CATEGORY_EMOJI, isCategory } from './types';

describe('isCategory', () => {
  it('accepts every known category', () => {
    for (const c of CATEGORIES) expect(isCategory(c)).toBe(true);
  });

  it('rejects unknown strings and undefined', () => {
    expect(isCategory('sports')).toBe(false);
    expect(isCategory('')).toBe(false);
    expect(isCategory(undefined)).toBe(false);
  });
});

describe('category metadata', () => {
  it('has a label and an emoji for every category', () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
      expect(CATEGORY_EMOJI[c]).toBeTruthy();
    }
  });
});
