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

/**
 * DB value (rooms.price_tiers, a smallint[]) → a valid tier Set. Junk entries are
 * dropped; null/undefined/empty/all-junk falls back to all-tiers-on so a fresh or
 * corrupt row (or an intentional all-off, which would show an empty deck) never
 * leaves the deck permanently blank.
 */
export function normalizePriceTiers(raw: number[] | null | undefined): Set<number> {
  const tiers = (raw ?? []).filter((n) => Number.isInteger(n) && isTier(n));
  return tiers.length ? new Set(tiers) : allPriceTiers();
}

/**
 * Toggle `level` in `current`. Refuses a toggle that would empty the set — an
 * empty write round-trips through `normalizePriceTiers`' empty-means-all
 * fallback and silently relights every chip, so the last selected tier can't
 * be turned off. Returns null when the toggle is refused.
 */
export function nextPriceTiers(current: number[], level: number): number[] | null {
  const next = new Set(current);
  if (next.has(level)) next.delete(level);
  else next.add(level);
  return next.size ? [...next] : null;
}
