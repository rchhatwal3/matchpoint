import { summarizeRooms, pickActiveRoom, shouldRedirectToRooms } from './rooms';
import type { Member, Room } from './types';

const room = (id: string, code: string): Room => ({
  id,
  code,
  locations: ['Berkeley, CA'],
  price_tiers: [0, 1, 2, 3, 4],
});

const member = (user_id: string, room_id: string, name: string, joined_at: string): Member => ({
  user_id,
  room_id,
  display_name: name,
  joined_at,
});

describe('summarizeRooms', () => {
  it('pairs each room with my name and my partner name', () => {
    const out = summarizeRooms(
      [room('r1', 'AAAAAA')],
      [member('me', 'r1', 'Ramneek', '2026-01-01T00:00:00Z'), member('you', 'r1', 'Tamana', '2026-01-02T00:00:00Z')],
      'me',
      new Map([['r1', 4]]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].room.code).toBe('AAAAAA');
    expect(out[0].displayName).toBe('Ramneek');
    expect(out[0].partnerName).toBe('Tamana');
    expect(out[0].matchCount).toBe(4);
  });

  it('reports a null partner for a room nobody has joined yet', () => {
    const out = summarizeRooms(
      [room('r1', 'AAAAAA')],
      [member('me', 'r1', 'Ramneek', '2026-01-01T00:00:00Z')],
      'me',
      new Map(),
    );
    expect(out[0].partnerName).toBeNull();
    expect(out[0].matchCount).toBe(0);
  });

  it('orders rooms by when I joined them, newest first', () => {
    const out = summarizeRooms(
      [room('r1', 'AAAAAA'), room('r2', 'BBBBBB')],
      [member('me', 'r1', 'R', '2026-01-01T00:00:00Z'), member('me', 'r2', 'R', '2026-02-01T00:00:00Z')],
      'me',
      new Map(),
    );
    expect(out.map((s) => s.room.id)).toEqual(['r2', 'r1']);
  });

  it('skips a room I hold no membership in', () => {
    const out = summarizeRooms(
      [room('r1', 'AAAAAA')],
      [member('someone', 'r1', 'Else', '2026-01-01T00:00:00Z')],
      'me',
      new Map(),
    );
    expect(out).toEqual([]);
  });

  it('ignores a third membership row rather than picking it as the partner', () => {
    // The two-member cap makes this unreachable, but a summary must not depend
    // on that: it takes the first other member and stays deterministic.
    const out = summarizeRooms(
      [room('r1', 'AAAAAA')],
      [
        member('me', 'r1', 'R', '2026-01-01T00:00:00Z'),
        member('b', 'r1', 'B', '2026-01-02T00:00:00Z'),
        member('c', 'r1', 'C', '2026-01-03T00:00:00Z'),
      ],
      'me',
      new Map(),
    );
    expect(out[0].partnerName).toBe('B');
  });
});

describe('pickActiveRoom', () => {
  const summaries = [
    { room: room('r1', 'AAAAAA'), displayName: 'R', partnerName: null, matchCount: 0 },
    { room: room('r2', 'BBBBBB'), displayName: 'R', partnerName: null, matchCount: 0 },
  ];

  it('keeps the stored room when it is still one of mine', () => {
    expect(pickActiveRoom('r2', summaries)).toBe('r2');
  });

  it('drops a stored room I have left', () => {
    expect(pickActiveRoom('gone', summaries)).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(pickActiveRoom(null, summaries)).toBeNull();
  });

  it('returns null when I have no rooms at all', () => {
    expect(pickActiveRoom('r1', [])).toBeNull();
  });
});

describe('shouldRedirectToRooms', () => {
  const returning = {
    loading: false,
    roomCount: 2,
    createdCode: null,
    openedDeliberately: false,
    hasInviteCode: false,
    submitting: false,
  };

  it('sends a returning user with rooms to the list', () => {
    expect(shouldRedirectToRooms(returning)).toBe(true);
  });

  it('waits while the session is still loading', () => {
    expect(shouldRedirectToRooms({ ...returning, loading: true })).toBe(false);
  });

  it('keeps a first-time user with no rooms on the form', () => {
    expect(shouldRedirectToRooms({ ...returning, roomCount: 0 })).toBe(false);
  });

  it('holds while a create or join is in flight, even once rooms have loaded', () => {
    expect(shouldRedirectToRooms({ ...returning, roomCount: 1, submitting: true })).toBe(false);
  });

  it('shows the share-code screen after a create', () => {
    expect(shouldRedirectToRooms({ ...returning, createdCode: 'ABC123' })).toBe(false);
  });

  it('honours a deliberate visit', () => {
    expect(shouldRedirectToRooms({ ...returning, openedDeliberately: true })).toBe(false);
  });

  it('lets an invite-code link reach the join form', () => {
    expect(shouldRedirectToRooms({ ...returning, hasInviteCode: true })).toBe(false);
  });
});
