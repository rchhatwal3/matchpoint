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
