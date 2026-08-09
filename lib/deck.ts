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
 * Merge per-location restaurant results into one deck that mixes cities instead
 * of serving them a city at a time.
 *
 * Each city's own results are shuffled, then drawn round-robin, so consecutive
 * cards come from different cities wherever cities still have cards left. A
 * plain shuffle of the merged list would satisfy "random" and still clump; a
 * plain interleave would spread perfectly and deal the same order every time.
 * Uneven cities degrade gracefully — once the short ones run out, the rest of
 * the long one follows in its own shuffled order.
 *
 * Deduped by id, first occurrence winning, since one restaurant can be returned
 * for two nearby cities. `rng` is injectable so the order is testable. Pure.
 */
export function mixByLocation(groups: Item[][], rng: () => number = Math.random): Item[] {
  const queues = groups.map((g) => shuffle(g, rng)).filter((g) => g.length > 0);
  const seen = new Set<string>();
  const out: Item[] = [];
  for (let i = 0; queues.length > 0; i = i % queues.length) {
    const item = queues[i].pop() as Item;
    if (queues[i].length === 0) queues.splice(i, 1);
    else i += 1;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** Fisher-Yates on a copy — the caller's array is never reordered. Pure. */
function shuffle(items: Item[], rng: () => number): Item[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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
