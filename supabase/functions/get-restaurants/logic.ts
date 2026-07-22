// Pure helpers for the get-restaurants edge function. Kept in a side-effect-free
// module (no Deno.serve) so they can be unit-tested with `deno test`.

// Upper bound on a city-level location string. Anything longer is not a real
// place name — rejecting it bounds the Places query and blocks abuse via
// oversized input.
export const MAX_LOCATION_LEN = 80;

// True when `loc` is one of the caller's room locations (case/space-insensitive).
// The T16 guard: only locations the pair saved can trigger a Places lookup.
export function isLocationAllowed(loc: string, allowed: string[]): boolean {
  return allowed.map((l) => l.trim().toLowerCase()).includes(loc.toLowerCase());
}

export type PlacesApiPlace = {
  displayName?: { text?: string };
  rating?: number;
  priceLevel?: string;
  types?: string[];
  userRatingCount?: number;
  photos?: { name?: string }[];
};

// Places `priceLevel` enum -> 1–4 (same source as the $/$$ subtitle label).
export function priceLevelNum(level?: string): number | null {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 1;
    case 'PRICE_LEVEL_MODERATE':
      return 2;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 4;
    default:
      return null;
  }
}

export function priceLabel(level?: string): string | null {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE':
      return '$';
    case 'PRICE_LEVEL_MODERATE':
      return '$$';
    case 'PRICE_LEVEL_EXPENSIVE':
      return '$$$';
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return '$$$$';
    default:
      return null;
  }
}

// Map the first food-related Places type to a friendly cuisine/venue label.
export function cuisineLabel(types?: string[]): string | null {
  if (!types) return null;
  for (const t of types) {
    if (t.endsWith('_restaurant') || t === 'restaurant' || t === 'cafe' || t === 'bar') {
      return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return null;
}

// Own-words descriptor synthesized from structured fields (never copied prose):
// e.g. "Italian restaurant · 4.6★ · $$".
export function describe(p: PlacesApiPlace): string | null {
  const parts: string[] = [];
  const cuisine = cuisineLabel(p.types);
  if (cuisine) parts.push(cuisine);
  if (typeof p.rating === 'number') parts.push(`${p.rating.toFixed(1)}★`);
  const price = priceLabel(p.priceLevel);
  if (price) parts.push(price);
  return parts.length ? parts.join(' · ') : null;
}
