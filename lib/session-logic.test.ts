import { mapSeedToItems, isNewMatch, type SeedRow } from './session-logic';

describe('mapSeedToItems', () => {
  const seed: SeedRow[] = [
    { category: 'food', title: 'Tacos', subtitle: 'Al pastor', emoji: '🌮', source: 'seed' },
    { category: 'vacations', title: 'Kyoto', image_url: 'https://example.com/kyoto.jpg' },
  ];

  it('assigns stable seed-N ids by position', () => {
    expect(mapSeedToItems(seed).map((i) => i.id)).toEqual(['seed-0', 'seed-1']);
  });

  it('carries fields through and nulls the missing optionals', () => {
    const [tacos, kyoto] = mapSeedToItems(seed);
    expect(tacos).toMatchObject({ category: 'food', title: 'Tacos', subtitle: 'Al pastor', emoji: '🌮', source: 'seed' });
    expect(kyoto).toMatchObject({ subtitle: null, emoji: null, source: null });
  });

  it('passes image_url through, nulling it when the row omits it', () => {
    const [tacos, kyoto] = mapSeedToItems(seed);
    expect(tacos.image_url).toBeNull();
    expect(kyoto.image_url).toBe('https://example.com/kyoto.jpg');
  });

  it('never sets location/price in offline mode', () => {
    for (const i of mapSeedToItems(seed)) {
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
