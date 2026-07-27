-- 014_delete_my_data.sql
-- GDPR/UK GDPR erasure for the caller. Anonymous users have no email to reach us
-- with, so this in-app control is the practical erasure mechanism (memo §2.3).
-- Shared-room policy: remove the erasing user (their member row + swipes cascade);
-- the room + the partner's data survive unless the partner also deletes. The room
-- is removed only when it becomes empty.

CREATE OR REPLACE FUNCTION delete_my_data() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room_id uuid;
  v_remaining int;
BEGIN
  SELECT room_id INTO v_room_id FROM members WHERE id = auth.uid();
  IF v_room_id IS NULL THEN
    RETURN; -- nothing to delete
  END IF;
  DELETE FROM members WHERE id = auth.uid(); -- cascades swipes (FK ON DELETE CASCADE)
  SELECT count(*) INTO v_remaining FROM members WHERE room_id = v_room_id;
  IF v_remaining = 0 THEN
    DELETE FROM rooms WHERE id = v_room_id; -- cascades any remnants
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_my_data() TO authenticated;
