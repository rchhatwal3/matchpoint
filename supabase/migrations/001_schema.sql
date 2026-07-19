-- Rooms: one per pair, joined via short invite code
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  -- Shared list of city-level location strings the pair is in / willing to
  -- travel to. Editable by both members (see rooms update policy in 002).
  locations text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Members: max 2 per room (enforced by trigger below).
-- id equals auth.uid() so each anonymous user maps to exactly one member row.
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  joined_at timestamptz DEFAULT now()
);

-- Items: shared, curated swipe cards across all rooms
CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('food','vacations','activities','date_nights','shows','restaurants')),
  title text NOT NULL,
  subtitle text,
  image_url text,
  source text,
  -- City-level tag; NULL = location-independent. Restaurant items are
  -- location-tagged, general food stays NULL.
  location text
);

-- Swipes: one row per (member, item); liked = true is a right-swipe
CREATE TABLE IF NOT EXISTS swipes (
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  liked boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (member_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_swipes_item_id ON swipes(item_id);
CREATE INDEX IF NOT EXISTS idx_members_room_id ON members(room_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_category_location ON items(category, location);

-- Enforce a hard cap of 2 members per room.
-- SECURITY DEFINER so the count sees all members regardless of the caller's RLS
-- (a joining user cannot yet "see" the room's existing members under RLS).
CREATE OR REPLACE FUNCTION enforce_room_member_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM members WHERE room_id = NEW.room_id) >= 2 THEN
    RAISE EXCEPTION 'room_full';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_member_limit ON members;
CREATE TRIGGER trg_room_member_limit
  BEFORE INSERT ON members
  FOR EACH ROW EXECUTE FUNCTION enforce_room_member_limit();

-- room_matches: items both members of a room right-swiped.
-- Groups likes per (room, item) and requires 2 distinct liking members;
-- since a room holds at most 2 members, that means both liked it.
-- security_invoker respects the swipes RLS below, so callers only ever see
-- matches for their own room.
CREATE VIEW room_matches
WITH (security_invoker = true) AS
  SELECT
    m.room_id,
    s.item_id,
    i.category,
    i.title,
    i.subtitle,
    i.image_url
  FROM swipes s
  JOIN members m ON m.id = s.member_id
  JOIN items i ON i.id = s.item_id
  WHERE s.liked = true
  GROUP BY m.room_id, s.item_id, i.category, i.title, i.subtitle, i.image_url
  HAVING count(DISTINCT s.member_id) = 2;
