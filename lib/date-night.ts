import type { Category, MatchRow } from './types';

/** Bucket matches by category — the per-category draw pools. Pure. */
export function groupByCategory(pool: MatchRow[]): Map<Category, MatchRow[]> {
  const map = new Map<Category, MatchRow[]>();
  for (const m of pool) {
    const list = map.get(m.category) ?? [];
    list.push(m);
    map.set(m.category, list);
  }
  return map;
}

/**
 * Roll one random match in every category that has matches, iterating `order`
 * so the result is stable. A category's previous pick is excluded when it has
 * another option, so a re-spin visibly changes. Empty categories yield no pick.
 * Pure — `rng` is injectable for tests.
 */
export function rollPicks(
  byCategory: Map<Category, MatchRow[]>,
  order: Category[],
  prev: Map<Category, MatchRow>,
  rng: () => number = Math.random,
): Map<Category, MatchRow> {
  const next = new Map<Category, MatchRow>();
  for (const c of order) {
    const list = byCategory.get(c);
    if (!list || list.length === 0) continue;
    const last = prev.get(c);
    const candidates =
      list.length > 1 && last ? list.filter((m) => m.item_id !== last.item_id) : list;
    next.set(c, candidates[Math.floor(rng() * candidates.length)]);
  }
  return next;
}
