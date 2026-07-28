// Pure helpers for the redeem-recovery-code edge function. Side-effect-free (no
// Deno.serve) so they can be unit-tested with `deno test`.

// Brute-force throttle on the unauthenticated redeem endpoint: 5 failed redeems
// within 15 minutes (per email) triggers a lockout (product decision). Pairs with
// the T16b CAPTCHA + endpoint rate limits.
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

// Given failed-attempt timestamps (epoch ms) and the current time, is this email
// locked out? True once THRESHOLD failures fall inside the trailing window.
export function isLockedOut(failureTimestamps: number[], now: number): boolean {
  const cutoff = now - LOCKOUT_WINDOW_MS;
  const inWindow = failureTimestamps.filter((t) => t >= cutoff);
  return inWindow.length >= LOCKOUT_THRESHOLD;
}

// Second cap, keyed on caller IP instead of email: a rotating unknown email
// (a1b2c3@x.com, d4e5f6@x.com, ...) never repeats, so isLockedOut above never
// trips and fail() would insert one row per request forever (P1: unbounded
// write amplifier). Same threshold/window as the per-email lockout — this is
// a second key on the same rule, not a different policy.
export function isIpOverLimit(failureTimestamps: number[], now: number): boolean {
  const cutoff = now - LOCKOUT_WINDOW_MS;
  const inWindow = failureTimestamps.filter((t) => t >= cutoff);
  return inWindow.length >= LOCKOUT_THRESHOLD;
}

// Rightmost hop in X-Forwarded-For — the address appended by the proxy
// closest to the function, which a client cannot forge. The header
// accumulates left to right (each proxy appends what it received from), so
// the LEFTMOST entry is whatever the client itself sent and must not be
// trusted; only the rightmost entry is proxy-supplied. Returns null if the
// header is missing, empty, or otherwise unusable. Never throws: a
// missing/malformed header degrades to "unknown IP" rather than crashing.
export function lastForwardedIp(header: string | null | undefined): string | null {
  if (!header) return null;
  const parts = header.split(',');
  const last = parts[parts.length - 1]?.trim();
  return last ? last : null;
}

// Same shape check as lib/auth-logic.ts's isValidEmail, duplicated here because
// edge functions (Deno) can't import from the app's lib/ directory. Rejects
// non-email-shaped or over-long input before any DB write (P1: unauthenticated
// callers were writing an unbounded number of rows with junk "emails").
const MAX_EMAIL_LENGTH = 254;

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Normalize a user-entered code to the stored form: drop spaces/dashes, upper.
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

// sha256(salt || code) as hex — must match the issue function's storage form.
export async function hashCode(code: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + code);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Constant-time compare of two equal-length hex hashes (avoids leaking match
// progress via timing). Different lengths short-circuit to false.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
