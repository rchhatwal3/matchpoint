import { friendlyRoomError, JOIN_FAILED } from './room-errors';

describe('friendlyRoomError', () => {
  it('maps the generic join failure to one honest message', () => {
    expect(friendlyRoomError(JOIN_FAILED)).toBe(
      "That code didn't work — check it with your partner and try again.",
    );
  });

  it('gives the throttle its own message', () => {
    expect(friendlyRoomError('too_many_attempts')).toBe(
      'Too many tries — take a short break, then try again.',
    );
  });

  it('points back at the consent checklist when it blocks entry', () => {
    expect(friendlyRoomError('consent_required')).toBe(
      'Please accept the terms first.',
    );
  });

  it('falls back for unrecognised failures', () => {
    expect(friendlyRoomError('not_authenticated')).toBe('Something went wrong. Try again.');
    expect(friendlyRoomError('')).toBe('Something went wrong. Try again.');
  });

  it('reads through a wrapped Postgres error message', () => {
    expect(
      friendlyRoomError('P0001: too_many_attempts'),
    ).toBe('Too many tries — take a short break, then try again.');
  });

  // The oracle this whole change exists to close: a caller must not be able to
  // tell "no room with that code" from "that room is full".
  it('does not distinguish a missing room from a full one', () => {
    expect(friendlyRoomError('room_not_found')).toBe(friendlyRoomError('room_full'));
    expect(friendlyRoomError('room_not_found')).toBe(friendlyRoomError(JOIN_FAILED));
  });

  it('never reveals whether a code exists', () => {
    for (const message of [JOIN_FAILED, 'room_not_found', 'room_full']) {
      const copy = friendlyRoomError(message);
      expect(copy).not.toMatch(/exist|found|full|taken|two people/i);
    }
  });
});
