import type { Item } from './types';

/**
 * Deck view: drop already-swiped items, then (restaurants only) apply the price
 * filter. Items with an unknown price_level always pass so a missing tier never
 * hides a card. Pure — the swipe screen memoizes over this.
 */
export function filterDeck(
  deck: Item[],
  swiped: Set<string>,
  isRestaurants: boolean,
  priceLevels: Set<number>,
): Item[] {
  return deck.filter(
    (i) =>
      !swiped.has(i.id) &&
      (!isRestaurants || i.price_level == null || priceLevels.has(i.price_level)),
  );
}
