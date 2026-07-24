import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  hashCode,
  isLockedOut,
  LOCKOUT_THRESHOLD,
  LOCKOUT_WINDOW_MS,
  normalizeCode,
  timingSafeEqual,
} from './logic.ts';

Deno.test('normalizeCode strips spaces/dashes and uppercases', () => {
  assertEquals(normalizeCode('abcde-fghij k'), 'ABCDEFGHIJK');
  assertEquals(normalizeCode('  ab cd-ef  '), 'ABCDEF');
});

Deno.test('isLockedOut trips at THRESHOLD failures inside the window', () => {
  const now = 1_000_000_000_000;
  const recent = Array.from({ length: LOCKOUT_THRESHOLD }, () => now - 1000);
  assertEquals(isLockedOut(recent, now), true);
  assertEquals(isLockedOut(recent.slice(1), now), false); // one under threshold
});

Deno.test('isLockedOut ignores failures older than the window', () => {
  const now = 1_000_000_000_000;
  const old = Array.from({ length: LOCKOUT_THRESHOLD }, () => now - LOCKOUT_WINDOW_MS - 1);
  assertEquals(isLockedOut(old, now), false);
  assertEquals(isLockedOut([], now), false);
});

Deno.test('hashCode matches the issue functions storage form and is salt-sensitive', async () => {
  const h = await hashCode('ABCDE', 'ff00');
  assertEquals(h, await hashCode('ABCDE', 'ff00'));
  assertEquals(h.length, 64);
  assertEquals(h === (await hashCode('ABCDE', 'ff01')), false);
});

Deno.test('timingSafeEqual is true only for identical equal-length strings', () => {
  assertEquals(timingSafeEqual('deadbeef', 'deadbeef'), true);
  assertEquals(timingSafeEqual('deadbeef', 'deadbeff'), false); // same length, differs
  assertEquals(timingSafeEqual('short', 'longer'), false); // length mismatch
});
