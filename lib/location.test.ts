import { normalizeLocation, normalizeLocations } from './location';

describe('normalizeLocation', () => {
  it('trims leading and trailing whitespace of every kind', () => {
    expect(normalizeLocation('  Seattle  ')).toBe('Seattle');
    expect(normalizeLocation('\t\nSeattle\n\t')).toBe('Seattle');
  });

  it('collapses runs of internal whitespace to one space', () => {
    expect(normalizeLocation('New    York')).toBe('New York');
    expect(normalizeLocation('New\t\nYork')).toBe('New York');
  });

  it('normalizes comma spacing to ", "', () => {
    expect(normalizeLocation('Seattle,WA')).toBe('Seattle, WA');
    expect(normalizeLocation('Seattle , WA')).toBe('Seattle, WA');
    expect(normalizeLocation('Seattle ,WA')).toBe('Seattle, WA');
    expect(normalizeLocation('Seattle,   WA')).toBe('Seattle, WA');
  });

  it('does not leave a trailing space on a string that ends in a comma', () => {
    expect(normalizeLocation('Seattle,')).toBe('Seattle,');
    expect(normalizeLocation('Seattle, ')).toBe('Seattle,');
  });

  it('title-cases words and uppercases 1–2 character runs', () => {
    expect(normalizeLocation('seattle, wa')).toBe('Seattle, WA');
    expect(normalizeLocation('new york, ny')).toBe('New York, NY');
    expect(normalizeLocation('SEATTLE, WA')).toBe('Seattle, WA');
    expect(normalizeLocation('sEaTtLe')).toBe('Seattle');
  });

  it('cases a 2-letter run the same whether or not a comma follows it', () => {
    expect(normalizeLocation('seattle, wa, 98101')).toBe('Seattle, WA, 98101');
    expect(normalizeLocation('d.c.')).toBe('D.C.');
  });

  it('title-cases runs longer than two characters, code or not', () => {
    // Documented consequence of the length rule: `usa` is three characters, so
    // it title-cases like any other word rather than uppercasing as `WA` does.
    expect(normalizeLocation('seattle, wa, usa')).toBe('Seattle, WA, Usa');
  });

  it('leaves punctuation other than commas alone', () => {
    expect(normalizeLocation("coeur d'alene, id")).toBe("Coeur D'Alene, ID");
    expect(normalizeLocation('winston-salem, nc')).toBe('Winston-Salem, NC');
  });

  it('handles digits in a location', () => {
    expect(normalizeLocation('paris 11e')).toBe('Paris 11e');
    expect(normalizeLocation('area 51')).toBe('Area 51');
  });

  it('title-cases accented and non-latin city names', () => {
    expect(normalizeLocation('são paulo, br')).toBe('São Paulo, BR');
    expect(normalizeLocation('ZÜRICH')).toBe('Zürich');
    expect(normalizeLocation('münchen,de')).toBe('München, DE');
    expect(normalizeLocation('東京')).toBe('東京');
  });

  it('returns an empty string for empty or whitespace-only input', () => {
    expect(normalizeLocation('')).toBe('');
    expect(normalizeLocation('   ')).toBe('');
    expect(normalizeLocation('\t\n ')).toBe('');
  });

  it('is idempotent', () => {
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
      expect(normalizeLocation(once)).toBe(once);
    }
  });
});

describe('normalizeLocations', () => {
  it('normalizes every entry', () => {
    expect(normalizeLocations(['  seattle,wa ', 'new york , ny'])).toEqual([
      'Seattle, WA',
      'New York, NY',
    ]);
  });

  it('drops entries that normalize to nothing', () => {
    expect(normalizeLocations(['', '   ', 'Seattle'])).toEqual(['Seattle']);
  });

  it('dedupes variants that collapse to the same canonical form, keeping the first', () => {
    expect(normalizeLocations(['Seattle, WA', 'seattle,wa', 'SEATTLE , WA'])).toEqual([
      'Seattle, WA',
    ]);
  });

  it('preserves order across distinct locations', () => {
    expect(normalizeLocations(['portland', 'seattle', 'portland'])).toEqual([
      'Portland',
      'Seattle',
    ]);
  });

  it('returns an empty list for an empty list', () => {
    expect(normalizeLocations([])).toEqual([]);
  });
});
