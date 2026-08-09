import type { Item } from './types';

/**
 * Deck view: drop already-swiped items, then (restaurants only) apply the price
 * filter. An unknown price_level maps to tier 0 ("Unpriced") — a selectable
 * category, so deselecting it actually hides the ~60% of places Google prices
 * as null. Pure — the swipe screen memoizes over this.
 */
export function filterDeck(
  deck: Item[],
  swiped: Set<string>,
  isRestaurants: boolean,
  priceLevels: Set<number>,
): Item[] {
  return deck.filter(
    (i) => !swiped.has(i.id) && (!isRestaurants || priceLevels.has(i.price_level ?? 0)),
  );
}

/**
 * Identity of the data a deck currently reflects, so a focus-refetch can skip
 * work when nothing changed. Restaurants are sourced from the room's locations,
 * so their key folds in a case-insensitive, order-independent signature of that
 * list — editing locations changes the key and forces a reload. Every other
 * category depends only on itself. Pure.
 */
export function deckLoadKey(category: string, locations: string[]): string {
  if (category !== 'restaurants') return category;
  const sig = locations
    .map((l) => l.trim().toLowerCase())
    .sort()
    .join('|');
  return `restaurants:${sig}`;
}

/**
 * The city to print under a card's title, or null to print nothing. Orienting
 * information only: with one location saved every card carries the same string,
 * so it is noise and stays off. `items.location` is canonical and region-bearing
 * since migrations 028/031/032, so it renders raw. Pure.
 */
export function cardLocationLabel(location: string | null, locationCount: number): string | null {
  if (locationCount < 2) return null;
  const trimmed = location?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Up to `count` non-null image_urls starting at `startIndex` — the photos to
 * prefetch so cards paint from cache by the time they reach the top. Pure.
 */
export function upcomingImageUrls(items: Item[], startIndex: number, count: number): string[] {
  const urls: string[] = [];
  for (let i = startIndex; i < items.length && urls.length < count; i++) {
    const url = items[i].image_url;
    if (url) urls.push(url);
  }
  return urls;
}
