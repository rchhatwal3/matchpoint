import { filterDeck } from './deck';
import type { Item } from './types';

function item(id: string, price_level: number | null = null): Item {
  return {
    id,
    category: 'restaurants',
    title: id,
    subtitle: null,
    emoji: null,
    image_url: null,
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
