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

  // The defect this file's rule 1 exists to fix: whole-uppercasing every 1–2
  // character run mangled the CITY, which is the part the user actually reads.
  it('title-cases short runs in the first comma part instead of uppercasing them', () => {
    expect(normalizeLocation('el paso, tx')).toBe('El Paso, TX');
    expect(normalizeLocation('santa fe, nm')).toBe('Santa Fe, NM');
    expect(normalizeLocation('ho chi minh city, vietnam')).toBe('Ho Chi Minh City, Vietnam');
    expect(normalizeLocation('st. petersburg, fl')).toBe('St. Petersburg, FL');
    expect(normalizeLocation('las vegas, nv')).toBe('Las Vegas, NV');
  });

  it('uppercases a 1–2 character run in any part after the first', () => {
    expect(normalizeLocation('seattle, wa')).toBe('Seattle, WA');
    expect(normalizeLocation('washington, dc')).toBe('Washington, DC');
    expect(normalizeLocation('new  york , ny')).toBe('New York, NY');
  });

  it('cases a Mc name on the syllable', () => {
    expect(normalizeLocation('mckinney, tx')).toBe('McKinney, TX');
    expect(normalizeLocation('mcallen, tx')).toBe('McAllen, TX');
    expect(normalizeLocation('MCKINNEY')).toBe('McKinney');
  });

  // `Mac` is deliberately NOT in the rule: no string-shape test separates
  // `MacArthur` from `Macon`, so these have to stay plain Title Case.
  it('leaves Mac words alone', () => {
    expect(normalizeLocation('macon, ga')).toBe('Macon, GA');
    expect(normalizeLocation('madison, wi')).toBe('Madison, WI');
  });

  it('lowercases a small word that is not the first run of its part', () => {
    expect(normalizeLocation('rio de janeiro, brazil')).toBe('Rio de Janeiro, Brazil');
    expect(normalizeLocation('isle of man')).toBe('Isle of Man');
    expect(normalizeLocation('newcastle upon tyne, uk')).toBe('Newcastle upon Tyne, UK');
  });

  it('keeps a small word capitalized when it opens its part', () => {
    expect(normalizeLocation('the dalles, or')).toBe('The Dalles, OR');
    expect(normalizeLocation('de pere, wi')).toBe('De Pere, WI');
    expect(normalizeLocation('los angeles, ca')).toBe('Los Angeles, CA');
    // Regression: `las`/`los` were once small words, so they lowercased
    // anywhere but the start of a part. `Las Vegas` hid it because it opens
    // its part; these two are the cases that exposed it.
    expect(normalizeLocation('north las vegas, nv')).toBe('North Las Vegas, NV');
    expect(normalizeLocation('east los angeles, ca')).toBe('East Los Angeles, CA');
    // A region code is the first run of its part, so the small-word rule never
    // reaches it: `de` after the comma is Germany, not a joiner.
    expect(normalizeLocation('münchen, de')).toBe('München, DE');
  });

  it('leaves a value with no comma at all as one part', () => {
    expect(normalizeLocation('el paso')).toBe('El Paso');
    expect(normalizeLocation('são paulo')).toBe('São Paulo');
    expect(normalizeLocation('mckinney')).toBe('McKinney');
  });

  it('passes a comma-only value through unchanged', () => {
    expect(normalizeLocation(',')).toBe(',');
    expect(normalizeLocation(',,,')).toBe(', , ,');
    expect(normalizeLocation('  ,  ,  ')).toBe(', ,');
  });

  it('leaves an already-canonical value untouched', () => {
    for (const canonical of [
      'Seattle, WA',
      'El Paso, TX',
      'McKinney, TX',
      'Rio de Janeiro, Brazil',
      'St. Petersburg, FL',
      'São Paulo, Brazil',
    ]) {
      expect(normalizeLocation(canonical)).toBe(canonical);
    }
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
    expect(normalizeLocation('são paulo, brazil')).toBe('São Paulo, Brazil');
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
      'el paso, tx',
      'mckinney, tx',
      'santa fe, nm',
      'ho chi minh city, vietnam',
      'rio de janeiro, brazil',
      'st. petersburg, fl',
      'las vegas, nv',
      'washington, dc',
      'new  york , ny',
      'the dalles, or',
      'de pere, wi',
      'isle of man',
      'macon, ga',
      'el paso',
      ',',
      ',,,',
      'McKinney, TX',
      'Rio de Janeiro, Brazil',
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
