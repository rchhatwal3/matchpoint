/**
 * Restaurant price-tier filter. Tier 0 = "unpriced" — Google Places (New) omits
 * a price for most places, so unpriced is a real, selectable category, not a
 * silent always-pass. Display order puts money tiers first, unpriced last.
 */
export const PRICE_TIERS = [1, 2, 3, 4, 0] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

const isTier = (n: number): n is PriceTier => (PRICE_TIERS as readonly number[]).includes(n);

/** Every tier selected — the default view (nothing hidden). */
export const allPriceTiers = (): Set<number> => new Set(PRICE_TIERS);

/** Selected set → a stable, storable string (sorted, valid tiers only). */
export function serializePriceTiers(selected: Set<number>): string {
  return [...selected]
    .filter(isTier)
    .sort((a, b) => a - b)
    .join(',');
}

/**
 * Stored string → a valid tier set. Junk tokens are dropped; an absent or empty
 * value falls back to all-tiers-on, so a corrupt store (or an intentional
 * all-off, which would show an empty deck) never leaves the deck permanently
 * blank on the next visit.
 */
export function parsePriceTiers(raw: string | null): Set<number> {
  if (raw == null) return allPriceTiers();
  const tiers = raw
    .split(',')
    .filter((t) => t.trim() !== '') // Number('') === 0, which is a valid tier — drop blanks first
    .map(Number)
    .filter((n) => Number.isInteger(n) && isTier(n));
  return tiers.length ? new Set(tiers) : allPriceTiers();
}
