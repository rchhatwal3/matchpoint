/** Shared domain types + category metadata for matchpoint. */

export const CATEGORIES = [
  'food',
  'restaurants',
  'vacations',
  'activities',
  'date_nights',
  'shows',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Human labels — date_nights renders "Date Nights", etc. */
export const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food',
  restaurants: 'Restaurants',
  vacations: 'Vacations',
  activities: 'Activities',
  date_nights: 'Date Nights',
  shows: 'Shows',
};

/** Glyph shown on the swipe panel (seed data ships no imagery). */
export const CATEGORY_EMOJI: Record<Category, string> = {
  food: '🍜',
  restaurants: '🍽️',
  vacations: '🏝️',
  activities: '🎯',
  date_nights: '🌙',
  shows: '🎬',
};

export function isCategory(v: string | undefined): v is Category {
  return !!v && (CATEGORIES as readonly string[]).includes(v);
}

export type Item = {
  id: string;
  category: Category;
  title: string;
  subtitle: string | null;
  /** Per-item emoji; falls back to the category glyph when null. */
  emoji: string | null;
  image_url: string | null;
  location: string | null;
  source: string | null;
};

export type Room = {
  id: string;
  code: string;
  locations: string[];
  created_at?: string;
};

export type Member = {
  id: string;
  room_id: string;
  display_name: string;
  joined_at?: string;
};

/** A row of the room_matches view — an item both members liked. */
export type MatchRow = {
  item_id: string;
  category: Category;
  title: string;
  subtitle: string | null;
  image_url: string | null;
};
