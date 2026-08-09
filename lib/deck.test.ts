import { cardLocationLabel, deckLoadKey, filterDeck, mixByLocation, upcomingImageUrls } from './deck';
import type { Item } from './types';

function item(id: string, price_level: number | null = null, image_url: string | null = null): Item {
  return {
    id,
    category: 'restaurants',
    title: id,
    subtitle: null,
    emoji: null,
    image_url,
    location: null,
    source: null,
    price_level,
  };
}

const ALL_PRICES = new Set([1, 2, 3, 4]);

describe('filterDeck', () => {
  it('drops already-swiped items', () => {
    const deck = [item('a'), item('b'), item('c')];
    const out = filterDeck(deck, new Set(['b']), false, ALL_PRICES);
    expect(out.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('applies the price filter for restaurants', () => {
    const deck = [item('cheap', 1), item('pricey', 4)];
    const out = filterDeck(deck, new Set(), true, new Set([1]));
    expect(out.map((i) => i.id)).toEqual(['cheap']);
  });

  it('treats unknown price as tier 0 — hidden when 0 is not selected', () => {
    const deck = [item('nulls', null), item('cheap', 1)];
    const out = filterDeck(deck, new Set(), true, new Set([1]));
    expect(out.map((i) => i.id)).toEqual(['cheap']);
  });

  it('keeps unknown-price items when tier 0 (Unpriced) is selected', () => {
    const deck = [item('nulls', null), item('pricey', 4)];
    const out = filterDeck(deck, new Set(), true, new Set([0]));
    expect(out.map((i) => i.id)).toEqual(['nulls']);
  });

  it('ignores price entirely for non-restaurant categories', () => {
    const deck = [item('a', 4), item('b', 1)];
    const out = filterDeck(deck, new Set(), false, new Set([2]));
    expect(out.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('deckLoadKey', () => {
  it('ignores locations for non-restaurant categories', () => {
    expect(deckLoadKey('activities', ['New York, NY'])).toBe('activities');
    expect(deckLoadKey('activities', [])).toBe('activities');
  });

  it('folds the location list into the restaurants key', () => {
    expect(deckLoadKey('restaurants', ['New York, NY'])).toBe('restaurants:new york, ny');
    expect(deckLoadKey('restaurants', [])).toBe('restaurants:');
  });

  it('is order- and case-independent for the same set of locations', () => {
    expect(deckLoadKey('restaurants', ['Austin, TX', 'Boston, MA'])).toBe(
      deckLoadKey('restaurants', ['boston, ma', ' Austin, TX ']),
    );
  });

  it('changes when a location is added or removed', () => {
    const before = deckLoadKey('restaurants', ['Austin, TX']);
    const after = deckLoadKey('restaurants', ['Austin, TX', 'Boston, MA']);
    expect(before).not.toBe(after);
  });
});

describe('upcomingImageUrls', () => {
  const withImg = (id: string) => item(id, null, `https://img/${id}.jpg`);

  it('returns urls starting at startIndex, capped at count', () => {
    const deck = [withImg('a'), withImg('b'), withImg('c'), withImg('d'), withImg('e')];
    expect(upcomingImageUrls(deck, 2, 3)).toEqual([
      'https://img/c.jpg',
      'https://img/d.jpg',
      'https://img/e.jpg',
    ]);
  });

  it('skips items with a null image_url', () => {
    const deck = [withImg('a'), item('b'), withImg('c'), item('d'), withImg('e')];
    expect(upcomingImageUrls(deck, 1, 3)).toEqual(['https://img/c.jpg', 'https://img/e.jpg']);
  });

  it('returns [] when startIndex is past the end', () => {
    expect(upcomingImageUrls([withImg('a'), withImg('b')], 5, 3)).toEqual([]);
  });
});

describe('cardLocationLabel', () => {
  it('prints the city when the room mixes several', () => {
    expect(cardLocationLabel('Seattle, WA', 3)).toBe('Seattle, WA');
  });

  it('prints nothing when one location is saved, since every card would match', () => {
    expect(cardLocationLabel('Seattle, WA', 1)).toBeNull();
    expect(cardLocationLabel('Seattle, WA', 0)).toBeNull();
  });

  it('prints nothing for an item that carries no location', () => {
    expect(cardLocationLabel(null, 3)).toBeNull();
    expect(cardLocationLabel('   ', 3)).toBeNull();
  });
});

describe('mixByLocation', () => {
  const at = (id: string, location: string): Item => ({ ...item(id), location });
  // Deterministic rng: cycles a fixed sequence so a test asserts a real order,
  // not a lucky one.
  const seeded = (seq: number[]) => {
    let i = 0;
    return () => seq[i++ % seq.length];
  };

  it('alternates cities instead of dealing one city at a time', () => {
    const out = mixByLocation(
      [
        [at('s1', 'Seattle, WA'), at('s2', 'Seattle, WA'), at('s3', 'Seattle, WA')],
        [at('n1', 'New York, NY'), at('n2', 'New York, NY'), at('n3', 'New York, NY')],
      ],
      seeded([0.5]),
    );
    const cities = out.map((i) => i.location);
    expect(out).toHaveLength(6);
    for (let i = 1; i < cities.length; i++) expect(cities[i]).not.toBe(cities[i - 1]);
  });

  it('keeps every card when the cities are uneven, tailing with the longer one', () => {
    const out = mixByLocation(
      [
        [at('s1', 'Seattle, WA'), at('s2', 'Seattle, WA'), at('s3', 'Seattle, WA')],
        [at('n1', 'New York, NY')],
      ],
      seeded([0.5]),
    );
    expect(out.map((i) => i.id).sort()).toEqual(['n1', 's1', 's2', 's3']);
    expect(out.slice(-2).map((i) => i.location)).toEqual(['Seattle, WA', 'Seattle, WA']);
  });

  it('dedupes a restaurant returned for two nearby cities', () => {
    const out = mixByLocation(
      [[at('shared', 'Seattle, WA')], [at('shared', 'Bellevue, WA'), at('b1', 'Bellevue, WA')]],
      seeded([0.5]),
    );
    expect(out.map((i) => i.id)).toEqual(expect.arrayContaining(['shared', 'b1']));
    expect(out).toHaveLength(2);
  });

  it('shuffles within a city rather than preserving the source order', () => {
    const group = ['a', 'b', 'c', 'd', 'e'].map((id) => at(id, 'Seattle, WA'));
    const out = mixByLocation([group], seeded([0.9, 0.1, 0.7, 0.3]));
    expect(out.map((i) => i.id)).not.toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(out.map((i) => i.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('does not reorder the caller’s arrays', () => {
    const group = [at('s1', 'Seattle, WA'), at('s2', 'Seattle, WA'), at('s3', 'Seattle, WA')];
    const before = group.map((i) => i.id);
    mixByLocation([group], seeded([0.9, 0.2]));
    expect(group.map((i) => i.id)).toEqual(before);
  });

  it('handles no cities and empty cities', () => {
    expect(mixByLocation([])).toEqual([]);
    expect(mixByLocation([[], []])).toEqual([]);
  });
});
