import { CITY_SUGGESTIONS, POPULAR_METROS } from './cities';
import { hasRegion, normalizeLocation } from './location';

// This suite is the reason the picker can be trusted: it is what turns "the
// cities will for sure get populated correctly" into a checked fact. A tapped
// suggestion is written straight to rooms.locations, so if an entry were not
// already canonical, the client would rewrite it on the way out (a second cache
// bucket for the same city — the waste 028 exists to stop) and if an entry
// carried no region, the picker would be handing the user a value the rest of
// the stack now refuses.
describe('CITY_SUGGESTIONS', () => {
  it('is a non-trivial list', () => {
    expect(CITY_SUGGESTIONS.length).toBeGreaterThan(300);
  });

  it('every entry is already canonical — normalizeLocation changes nothing', () => {
    const changed = CITY_SUGGESTIONS.filter((c) => normalizeLocation(c) !== c);
    expect(changed).toEqual([]);
  });

  it('every entry carries a region', () => {
    const regionless = CITY_SUGGESTIONS.filter((c) => !hasRegion(c));
    expect(regionless).toEqual([]);
  });

  it('has no duplicates', () => {
    const dupes = CITY_SUGGESTIONS.filter((c, i) => CITY_SUGGESTIONS.indexOf(c) !== i);
    expect(dupes).toEqual([]);
  });

  // MAX_LOCATION_LEN in get-restaurants/logic.ts, mirrored by the CHECK on
  // items.location (025). A suggestion longer than this would be accepted by the
  // field and then 400 on the first deck load.
  it('every entry fits the 80-character location cap', () => {
    const tooLong = CITY_SUGGESTIONS.filter((c) => c.length > 80);
    expect(tooLong).toEqual([]);
  });

  it('includes the cities the seeded rooms actually use', () => {
    expect(CITY_SUGGESTIONS).toContain('Seattle, WA');
    expect(CITY_SUGGESTIONS).toContain('New Orleans, LA');
    // Both Portlands, because that ambiguity is the whole reason a region is
    // required and nothing may guess one for the legacy bare `Portland` rows.
    expect(CITY_SUGGESTIONS).toContain('Portland, OR');
    expect(CITY_SUGGESTIONS).toContain('Portland, ME');
  });
});

describe('POPULAR_METROS', () => {
  it('every entry is canonical and carries a region', () => {
    for (const metro of POPULAR_METROS) {
      expect(normalizeLocation(metro)).toBe(metro);
      expect(hasRegion(metro)).toBe(true);
    }
  });

  it('is a subset of the suggestion list, so the two cannot drift', () => {
    const missing = POPULAR_METROS.filter((m) => !CITY_SUGGESTIONS.includes(m));
    expect(missing).toEqual([]);
  });
});
