// Pure helpers for the issue-recovery-codes edge function. Side-effect-free (no
// Deno.serve) so they can be unit-tested with `deno test`.

// 8 codes per set (product decision). High-entropy codes make brute force
// infeasible, so a salted SHA-256 is sufficient for storage (no bcrypt needed).
export const CODE_COUNT = 8;

// 25 symbols from a 32-char alphabet = 125 bits of entropy. The alphabet drops
// ambiguous glyphs (0/O/1/I) so codes stay transcribable — same set as room
// codes (003_rpc.sql). 32 divides 256 evenly, so `byte & 31` is unbiased.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 25;

// Map CODE_LENGTH random bytes to a code string. Pure — inject the bytes to test.
export function encodeCode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] & 31];
  return out;
}

// A fresh random code from the crypto RNG.
export function newCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return encodeCode(bytes);
}

// A per-code random salt (128-bit, hex).
export function newSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

// sha256(salt || code) as hex — the stored form.
export async function hashCode(code: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + code);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
