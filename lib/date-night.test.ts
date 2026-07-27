import { groupByCategory, rollPicks } from './date-night';
import type { Category, MatchRow } from './types';

const m = (item_id: string, category: Category, title = item_id): MatchRow => ({
  item_id,
  category,
  title,
  subtitle: null,
  image_url: null,
});

const ORDER: Category[] = ['restaurants', 'date_nights', 'activities'];

describe('groupByCategory', () => {
  it('buckets matches by category', () => {
    const g = groupByCategory([m('a', 'restaurants'), m('b', 'restaurants'), m('c', 'activities')]);
    expect(g.get('restaurants')?.map((x) => x.item_id)).toEqual(['a', 'b']);
    expect(g.get('activities')?.map((x) => x.item_id)).toEqual(['c']);
    expect(g.has('date_nights')).toBe(false);
  });
});

describe('rollPicks', () => {
  it('returns one pick per category that has matches', () => {
    const g = groupByCategory([m('a', 'restaurants'), m('c', 'activities')]);
    const picks = rollPicks(g, ORDER, new Map(), () => 0);
    expect(picks.size).toBe(2);
    expect(picks.get('restaurants')?.item_id).toBe('a');
    expect(picks.get('activities')?.item_id).toBe('c');
  });

  it('skips categories with no matches', () => {
    const g = groupByCategory([m('a', 'restaurants')]);
    const picks = rollPicks(g, ORDER, new Map(), () => 0);
    expect(picks.size).toBe(1);
    expect(picks.has('date_nights')).toBe(false);
  });

  it('uses rng to index within a category', () => {
    const g = groupByCategory([m('a', 'restaurants'), m('b', 'restaurants'), m('c', 'restaurants')]);
    // rng 0.99 -> floor(0.99 * 3) = index 2
    const picks = rollPicks(g, ORDER, new Map(), () => 0.99);
    expect(picks.get('restaurants')?.item_id).toBe('c');
  });

  it('excludes the previous pick when the category has another option', () => {
    const g = groupByCategory([m('a', 'restaurants'), m('b', 'restaurants')]);
    const prev = new Map<Category, MatchRow>([['restaurants', m('a', 'restaurants')]]);
    // candidates become [b]; any rng lands on b
    const picks = rollPicks(g, ORDER, prev, () => 0);
    expect(picks.get('restaurants')?.item_id).toBe('b');
  });

  it('keeps the only option even if it equals the previous pick', () => {
    const g = groupByCategory([m('a', 'restaurants')]);
    const prev = new Map<Category, MatchRow>([['restaurants', m('a', 'restaurants')]]);
    const picks = rollPicks(g, ORDER, prev, () => 0);
    expect(picks.get('restaurants')?.item_id).toBe('a');
  });
});
