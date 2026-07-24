import { assertEquals, assertMatch, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { CODE_ALPHABET, CODE_COUNT, CODE_LENGTH, encodeCode, hashCode, newCode, newSalt } from './logic.ts';

Deno.test('encodeCode maps each byte to the alphabet via byte & 31 (unbiased)', () => {
  const bytes = new Uint8Array(CODE_LENGTH).fill(0);
  assertEquals(encodeCode(bytes), CODE_ALPHABET[0].repeat(CODE_LENGTH));
  const ones = new Uint8Array(CODE_LENGTH).fill(33); // 33 & 31 = 1
  assertEquals(encodeCode(ones), CODE_ALPHABET[1].repeat(CODE_LENGTH));
});

Deno.test('newCode is CODE_LENGTH chars from the no-ambiguous alphabet', () => {
  const code = newCode();
  assertEquals(code.length, CODE_LENGTH);
  assertMatch(code, /^[A-HJ-NP-Z2-9]{25}$/);
});

Deno.test('newCode is random (two draws differ)', () => {
  assertNotEquals(newCode(), newCode());
});

Deno.test('newSalt is 32 hex chars (128-bit) and random', () => {
  const salt = newSalt();
  assertMatch(salt, /^[0-9a-f]{32}$/);
  assertNotEquals(newSalt(), newSalt());
});

Deno.test('hashCode is deterministic for the same code+salt, differs otherwise', async () => {
  const a = await hashCode('ABCDE', 'ff00');
  assertEquals(a, await hashCode('ABCDE', 'ff00'));
  assertMatch(a, /^[0-9a-f]{64}$/); // sha256 hex
  assertNotEquals(a, await hashCode('ABCDE', 'ff01')); // salt matters
  assertNotEquals(a, await hashCode('ABCDF', 'ff00')); // code matters
});

Deno.test('CODE_COUNT is 8 (product decision)', () => {
  assertEquals(CODE_COUNT, 8);
});
