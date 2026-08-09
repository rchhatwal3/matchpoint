/** How far along a multi-location deck fetch is. */
export type FetchProgress = { done: number; total: number };

/**
 * Fraction of a fetch that has landed, 0..1. A fetch with nothing to do reads
 * as complete rather than dividing by zero, and a `done` past `total` clamps —
 * the bar must never render wider than its track. Pure.
 */
export function progressFraction({ done, total }: FetchProgress): number {
  if (total <= 0) return 1;
  return Math.min(Math.max(done, 0), total) / total;
}
