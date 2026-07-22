import { filterDeck, upcomingImageUrls } from './deck';
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

  it('always keeps restaurant items with an unknown price', () => {
    const deck = [item('nulls', null), item('pricey', 4)];
    const out = filterDeck(deck, new Set(), true, new Set([1]));
    expect(out.map((i) => i.id)).toEqual(['nulls']);
  });

  it('ignores price entirely for non-restaurant categories', () => {
    const deck = [item('a', 4), item('b', 1)];
    const out = filterDeck(deck, new Set(), false, new Set([2]));
    expect(out.map((i) => i.id)).toEqual(['a', 'b']);
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
