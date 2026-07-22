import { mapSeedToItems, isNewMatch, type SeedRow } from './session-logic';

describe('mapSeedToItems', () => {
  const seed: SeedRow[] = [
    { category: 'food', title: 'Tacos', subtitle: 'Al pastor', emoji: '🌮', source: 'seed' },
    { category: 'vacations', title: 'Kyoto' },
  ];

  it('assigns stable seed-N ids by position', () => {
    expect(mapSeedToItems(seed).map((i) => i.id)).toEqual(['seed-0', 'seed-1']);
  });

  it('carries fields through and nulls the missing optionals', () => {
    const [tacos, kyoto] = mapSeedToItems(seed);
    expect(tacos).toMatchObject({ category: 'food', title: 'Tacos', subtitle: 'Al pastor', emoji: '🌮', source: 'seed' });
    expect(kyoto).toMatchObject({ subtitle: null, emoji: null, source: null });
  });

  it('never sets image/location/price in offline mode', () => {
    for (const i of mapSeedToItems(seed)) {
      expect(i.image_url).toBeNull();
      expect(i.location).toBeNull();
      expect(i.price_level).toBeNull();
    }
  });
});

describe('isNewMatch', () => {
  it('is true the first time an id is seen, false on repeat', () => {
    const seen = new Set<string>();
    expect(isNewMatch(seen, 'x')).toBe(true);
    seen.add('x');
    expect(isNewMatch(seen, 'x')).toBe(false);
  });
});
