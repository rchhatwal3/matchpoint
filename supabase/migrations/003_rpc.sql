-- create_room: mint a unique 6-char code, create the room, and add the caller
-- as its first member. Returns the code.
-- Codes use A-Z0-9 minus ambiguous glyphs (0, O, 1, I) -> 32-symbol alphabet.
CREATE OR REPLACE FUNCTION create_room(p_name text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    END LOOP;
    BEGIN
      INSERT INTO rooms (code) VALUES (v_code);
      EXIT;  -- inserted cleanly; code is unique
    EXCEPTION WHEN unique_violation THEN
      -- collision, loop and try another code
    END;
  END LOOP;

  INSERT INTO members (id, room_id, display_name)
    SELECT v_uid, r.id, p_name FROM rooms r WHERE r.code = v_code;

  RETURN v_code;
END;
$$;

-- join_room: add the caller to an existing room by code. Idempotent — if the
-- caller is already a member, returns the room id without error. Raises
-- 'room_not_found' or 'room_full' otherwise. Returns the room id.
CREATE OR REPLACE FUNCTION join_room(p_code text, p_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_room_id uuid;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT id INTO v_room_id FROM rooms WHERE code = v_code;
  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;

  -- Already in this room: no-op, return it.
  IF EXISTS (SELECT 1 FROM members WHERE id = v_uid AND room_id = v_room_id) THEN
    RETURN v_room_id;
  END IF;

  SELECT count(*) INTO v_count FROM members WHERE room_id = v_room_id;
  IF v_count >= 2 THEN
    RAISE EXCEPTION 'room_full';
  END IF;

  INSERT INTO members (id, room_id, display_name)
    VALUES (v_uid, v_room_id, p_name);

  RETURN v_room_id;
END;
$$;

-- Supabase anonymous users authenticate under the 'authenticated' role, so a
-- single grant to authenticated covers both anonymous and full-auth sessions.
GRANT EXECUTE ON FUNCTION create_room(text) TO authenticated;
GRANT EXECUTE ON FUNCTION join_room(text, text) TO authenticated;
