// User-facing copy for create-room / join-room failures.
//
// The server returns ONE indistinguishable failure for "no such code" and
// "that room is full" (016_invite_code_hardening.sql) — telling them apart
// would hand an attacker a map of which 6-character codes are live. Keep the
// two merged here: this mapping is the last place the distinction could leak.
// The legacy 'room_not_found' / 'room_full' strings are still recognised so a
// client running against a pre-016 database says the same honest thing.

/** Thrown client-side when join_room returns NULL — its single generic failure. */
export const JOIN_FAILED = 'join_failed';

const CODE_FAILED = "That code didn't work — check it with your partner and try again.";

export function friendlyRoomError(message: string): string {
  if (message.includes('too_many_attempts')) {
    return 'Too many tries — take a short break, then try again.';
  }
  if (message.includes('consent_required')) {
    return 'Please accept the terms and confirm your age first.';
  }
  if (
    message.includes(JOIN_FAILED) ||
    message.includes('room_not_found') ||
    message.includes('room_full')
  ) {
    return CODE_FAILED;
  }
  return 'Something went wrong. Try again.';
}
