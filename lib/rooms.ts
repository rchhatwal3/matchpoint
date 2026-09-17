import type { Member, Room } from './types';

/** A room as the rooms list renders it: who is in it and how it is doing. */
export type RoomSummary = {
  room: Room;
  /** My own display name in this room. */
  displayName: string;
  /** The other member's name, or null while nobody has joined. */
  partnerName: string | null;
  matchCount: number;
};

/**
 * Groups the flat reads — every room I belong to, every member row visible in
 * those rooms — into one summary per room, newest membership first.
 *
 * Pure so the grouping is testable without a database: RLS already guarantees
 * `members` only contains rooms the caller belongs to, so the filtering here is
 * about correctness of display, not access control.
 */
export function summarizeRooms(
  rooms: Room[],
  members: Member[],
  myUserId: string,
  matchCounts: Map<string, number>,
): RoomSummary[] {
  const summaries: RoomSummary[] = [];

  for (const room of rooms) {
    const inRoom = members.filter((m) => m.room_id === room.id);
    const me = inRoom.find((m) => m.user_id === myUserId);
    if (!me) continue; // not mine to show

    const partner = inRoom.find((m) => m.user_id !== myUserId) ?? null;
    summaries.push({
      room,
      displayName: me.display_name,
      partnerName: partner ? partner.display_name : null,
      matchCount: matchCounts.get(room.id) ?? 0,
    });
  }

  return summaries.sort((a, b) => joinedAt(b, members, myUserId) - joinedAt(a, members, myUserId));
}

function joinedAt(summary: RoomSummary, members: Member[], myUserId: string): number {
  const mine = members.find((m) => m.room_id === summary.room.id && m.user_id === myUserId);
  return mine?.joined_at ? Date.parse(mine.joined_at) : 0;
}

/**
 * Resolves the per-device stored active room against what the caller actually
 * belongs to now. A room left on another device, or one they were removed from,
 * must not survive as the active room.
 */
export function pickActiveRoom(storedId: string | null, summaries: RoomSummary[]): string | null {
  if (!storedId) return null;
  return summaries.some((s) => s.room.id === storedId) ? storedId : null;
}

/**
 * Whether the entry screen should send the caller to the rooms list instead of
 * the create/join form. Anyone with rooms goes to the list, except:
 * - a code was just created (the share-code screen must show first),
 * - a deliberate visit (`?new=1`, the list's "New room" button),
 * - an invite-code deep link (joining a second room is the point),
 * - a create or join started on this screen is still in flight: createRoom and
 *   joinRoom fill the rooms list several awaits before they return, so without
 *   this the list would win the race against the screen they lead to.
 */
export function shouldRedirectToRooms(state: {
  loading: boolean;
  roomCount: number;
  createdCode: string | null;
  openedDeliberately: boolean;
  hasInviteCode: boolean;
  submitting: boolean;
}): boolean {
  return (
    !state.loading &&
    state.roomCount > 0 &&
    !state.createdCode &&
    !state.openedDeliberately &&
    !state.hasInviteCode &&
    !state.submitting
  );
}
