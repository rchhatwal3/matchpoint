import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  hashCode,
  isIpOverLimit,
  isLockedOut,
  isValidEmail,
  lastForwardedIp,
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

Deno.test('isValidEmail accepts a normal email', () => {
  assertEquals(isValidEmail('a@b.com'), true);
});

Deno.test('isValidEmail rejects input over 254 characters', () => {
  const local = 'a'.repeat(250);
  const longEmail = `${local}@b.com`; // 250 + 6 = 256 chars
  assertEquals(longEmail.length > 254, true);
  assertEquals(isValidEmail(longEmail), false);
});

Deno.test('isValidEmail accepts exactly 254 characters', () => {
  const local = 'a'.repeat(248);
  const email = `${local}@b.com`; // 248 + 6 = 254 chars
  assertEquals(email.length, 254);
  assertEquals(isValidEmail(email), true);
});

Deno.test('isValidEmail rejects non-email-shaped input', () => {
  assertEquals(isValidEmail('not-an-email'), false); // no @
  assertEquals(isValidEmail('a@b'), false); // no dot in domain
  assertEquals(isValidEmail('@b.com'), false); // no local part
  assertEquals(isValidEmail('a@'), false); // no domain
  assertEquals(isValidEmail('a b@c.com'), false); // whitespace
  assertEquals(isValidEmail(''), false); // empty
});

Deno.test('isIpOverLimit trips at THRESHOLD failures inside the window', () => {
  const now = 1_000_000_000_000;
  const recent = Array.from({ length: LOCKOUT_THRESHOLD }, () => now - 1000);
  assertEquals(isIpOverLimit(recent, now), true);
  assertEquals(isIpOverLimit(recent.slice(1), now), false); // one under threshold
});

Deno.test('isIpOverLimit ignores failures older than the window', () => {
  const now = 1_000_000_000_000;
  const old = Array.from({ length: LOCKOUT_THRESHOLD }, () => now - LOCKOUT_WINDOW_MS - 1);
  assertEquals(isIpOverLimit(old, now), false);
  assertEquals(isIpOverLimit([], now), false);
});

Deno.test('lastForwardedIp returns the only entry for a single-hop header', () => {
  assertEquals(lastForwardedIp('5.6.7.8'), '5.6.7.8');
  assertEquals(lastForwardedIp('  5.6.7.8  '), '5.6.7.8');
});

Deno.test('lastForwardedIp takes the rightmost entry from a multi-hop header', () => {
  assertEquals(lastForwardedIp('1.2.3.4, 5.6.7.8'), '5.6.7.8');
  assertEquals(lastForwardedIp('1.2.3.4,5.6.7.8,9.9.9.9'), '9.9.9.9');
});

Deno.test('lastForwardedIp ignores a spoofed leftmost entry (regression: leftmost hop is client-controlled, must not be trusted)', () => {
  const spoofed = '203.0.113.1'; // attacker-supplied leftmost entry
  const trusted = '198.51.100.7'; // appended by the proxy closest to the function
  assertEquals(lastForwardedIp(`${spoofed}, ${trusted}`), trusted);
});

Deno.test('lastForwardedIp treats missing/empty/unparseable header as unknown, not a crash', () => {
  assertEquals(lastForwardedIp(null), null);
  assertEquals(lastForwardedIp(undefined), null);
  assertEquals(lastForwardedIp(''), null);
  assertEquals(lastForwardedIp('   '), null);
  assertEquals(lastForwardedIp(','), null);
});
