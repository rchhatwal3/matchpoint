import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { bearerToken, failure, tokenUid, type Stage } from './logic.ts';

Deno.test('bearerToken extracts the token from a well-formed header', () => {
  assertEquals(bearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assertEquals(bearerToken('bearer abc.def.ghi'), 'abc.def.ghi'); // scheme is case-insensitive
  assertEquals(bearerToken('  Bearer   abc.def.ghi  '), 'abc.def.ghi');
});

Deno.test('bearerToken rejects anything that is not a single bearer token', () => {
  assertEquals(bearerToken(null), null);
  assertEquals(bearerToken(undefined), null);
  assertEquals(bearerToken(''), null);
  assertEquals(bearerToken('Bearer'), null);
  assertEquals(bearerToken('Bearer '), null);
  assertEquals(bearerToken('abc.def.ghi'), null); // no scheme
  assertEquals(bearerToken('Basic abc.def.ghi'), null);
  assertEquals(bearerToken('Bearer abc def'), null); // two values, ambiguous
});

Deno.test('tokenUid takes the uid from the resolved token user', () => {
  assertEquals(tokenUid({ id: 'caller-uid' }), 'caller-uid');
});

Deno.test('tokenUid yields null when the token resolved no user', () => {
  assertEquals(tokenUid(null), null);
  assertEquals(tokenUid({}), null);
  assertEquals(tokenUid({ id: '' }), null);
  assertEquals(tokenUid({ id: 123 }), null);
});

Deno.test('expected erasure failures are HTTP 200 so invoke surfaces the message', () => {
  assertEquals(failure('data').status, 200);
  assertEquals(failure('account').status, 200);
  assertEquals(failure('auth').status, 401);
  assertEquals(failure('server').status, 500);
});

Deno.test('failure bodies are ok:false, stage-tagged and non-empty', () => {
  for (const stage of ['auth', 'data', 'account', 'server'] as Stage[]) {
    const { body } = failure(stage);
    assertEquals(body.ok, false);
    assertEquals(body.stage, stage);
    assert(body.error.length > 0, `${stage} has no message`);
  }
});

Deno.test('failure messages are fixed strings that cannot carry upstream detail', () => {
  // Pinned exactly: `failure` takes only a Stage, so the only way upstream error
  // text could reach a caller is by someone editing these constants to
  // interpolate it. This test is what fails if that happens.
  assertEquals(
    failure('data').body.error,
    'Could not delete your data. Nothing was deleted — please try again.',
  );
  assertEquals(
    failure('account').body.error,
    'Your data was deleted, but your login could not be removed. Please try again to finish.',
  );
  assertEquals(failure('auth').body.error, 'Unauthorized');
  assertEquals(failure('server').body.error, 'Could not delete your account. Please try again.');
});
