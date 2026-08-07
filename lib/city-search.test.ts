import { MAX_CITY_SUGGESTIONS, searchCities } from './city-search';
import { hasRegion, normalizeLocation } from './location';

describe('searchCities', () => {
  it('returns nothing until the user types', () => {
    expect(searchCities('')).toEqual([]);
    expect(searchCities('   ')).toEqual([]);
    expect(searchCities(',')).toEqual([]);
  });

  it('prefix-matches a city name', () => {
    expect(searchCities('seat')).toEqual(['Seattle, WA']);
    expect(searchCities('bost')).toEqual(['Boston, MA']);
  });

  it('is case-insensitive', () => {
    expect(searchCities('SEAT')).toEqual(searchCities('seat'));
  });

  it('matches a word inside the entry, not just its start', () => {
    expect(searchCities('orleans')).toEqual(['New Orleans, LA']);
    expect(searchCities('francisco')).toEqual(['San Francisco, CA']);
  });

  it('matches mid-word too, ranked below the cleaner matches', () => {
    const hits = searchCities('ork');
    expect(hits).toContain('New York, NY');
  });

  it('ranks a prefix match above a word match above a mid-word match', () => {
    const hits = searchCities('port', 50);
    expect(hits[0]).toBe('Portland, OR');
    // `Portland` starts with it; `Newport News` only contains it mid-word.
    expect(hits.indexOf('Portland, ME')).toBeLessThan(hits.indexOf('Newport News, VA'));
  });

  it('breaks ties by the list order, which is roughly by population', () => {
    const hits = searchCities('new');
    expect(hits[0]).toBe('New York, NY');
  });

  it('finds a city by its region', () => {
    const french = searchCities('france');
    expect(french[0]).toBe('Paris, France');
    expect(french.every((c) => c.endsWith(', France'))).toBe(true);
    expect(searchCities('switzerland')).toEqual(['Zurich, Switzerland']);
    expect(searchCities('wa', 50)).toContain('Seattle, WA');
  });

  it('ignores comma spacing, so a fully typed location still matches', () => {
    expect(searchCities('seattle,wa')).toEqual(['Seattle, WA']);
    expect(searchCities('seattle , wa')).toEqual(['Seattle, WA']);
    expect(searchCities('Seattle, WA')).toEqual(['Seattle, WA']);
  });

  it('is accent-insensitive in both directions', () => {
    expect(searchCities('zürich')).toEqual(['Zurich, Switzerland']);
    expect(searchCities('zurich')).toEqual(['Zurich, Switzerland']);
    expect(searchCities('sao paulo')).toEqual(['Sao Paulo, Brazil']);
    expect(searchCities('são paulo')).toEqual(['Sao Paulo, Brazil']);
  });

  it('treats regex punctuation as literal text rather than a pattern', () => {
    expect(searchCities('(')).toEqual([]);
    expect(searchCities('*')).toEqual([]);
    expect(searchCities('.')).toEqual([]);
  });

  it('returns nothing for a city that is not on the list', () => {
    // Not a gap to fix — the list is suggestions, and Wenatchee stays typeable
    // by hand. This asserts the search does not invent matches.
    expect(searchCities('wenatchee')).toEqual([]);
  });

  it('caps the result count', () => {
    expect(searchCities('san').length).toBeLessThanOrEqual(MAX_CITY_SUGGESTIONS);
    expect(searchCities('a').length).toBe(MAX_CITY_SUGGESTIONS);
    expect(searchCities('a', 3)).toHaveLength(3);
  });

  // The picker's whole promise: whatever it hands back is canonical and carries
  // a region, so tapping a suggestion can never produce a value the write path
  // would rewrite or refuse.
  it('only ever returns values that are canonical and region-bearing', () => {
    for (const q of ['a', 'san', 'new', 'port', 'zurich', 'wa', 'city']) {
      for (const hit of searchCities(q)) {
        expect(normalizeLocation(hit)).toBe(hit);
        expect(hasRegion(hit)).toBe(true);
      }
    }
  });
});
