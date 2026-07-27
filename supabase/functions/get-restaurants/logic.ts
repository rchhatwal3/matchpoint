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

// Per-user cost budget. The room-locations guard above is self-authorizing —
// members may UPDATE rooms.locations — so it cannot bound spend on its own.
// This counts only lookups that actually go upstream to Places/Foursquare.
export const LOOKUP_LIMIT = 50;
export const LOOKUP_WINDOW_MS = 24 * 60 * 60 * 1000;

// Start of the trailing budget window, as an ISO timestamp for the `at` filter.
export function lookupWindowStart(now: Date): string {
  return new Date(now.getTime() - LOOKUP_WINDOW_MS).toISOString();
}

// True when the user has already spent the whole window's budget.
export function isOverLookupBudget(countInWindow: number): boolean {
  return countInWindow >= LOOKUP_LIMIT;
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

export type Place = {
  title: string;
  subtitle: string | null;
  image_url: string | null;
  price_level: number | null;
};

// Flatten paginated Google results into one list, deduping by lowercased
// title (first occurrence wins) — the same dedupe rule already used against
// stored rows.
export function mergeDedupe(pages: Place[][]): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const page of pages) {
    for (const p of page) {
      const key = p.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

// Light normalization for the Foursquare query string — trim + collapse
// internal whitespace. Not fuzzy matching, just a clean query term.
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

// Extract a valid Foursquare price tier (1–4) from one `results[]` entry of
// a Places Search response. Anything malformed or out of range -> null so
// the caller just leaves that item unenriched.
export function foursquarePrice(result: unknown): number | null {
  if (typeof result !== 'object' || result === null) return null;
  const price = (result as { price?: unknown }).price;
  if (typeof price !== 'number' || !Number.isInteger(price)) return null;
  if (price < 1 || price > 4) return null;
  return price;
}
