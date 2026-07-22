import type { Category, Item } from './types';

export type SeedRow = {
  category: string;
  title: string;
  subtitle?: string;
  emoji?: string;
  source?: string;
};

/**
 * Offline dev mode: map bundled seed rows to Items with stable local ids, so the
 * same shape flows through the UI as the online path. Solo — no image/location/
 * price, which the seed doesn't carry into offline mode.
 */
export function mapSeedToItems(seed: SeedRow[]): Item[] {
  return seed.map((row, i) => ({
    id: `seed-${i}`,
    category: row.category as Category,
    title: row.title,
    subtitle: row.subtitle ?? null,
    emoji: row.emoji ?? null,
    image_url: null,
    location: null,
    source: row.source ?? null,
    price_level: null,
  }));
}

/**
 * Match detection is dual-path (immediate on my like + realtime on partner's),
 * so the same match can surface twice. True only the first time an id is seen;
 * the caller records it to suppress the repeat.
 */
export function isNewMatch(seen: Set<string>, id: string): boolean {
  return !seen.has(id);
}
