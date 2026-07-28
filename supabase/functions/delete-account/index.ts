import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';
import { bearerToken, failure, tokenUid, type FailureResponse } from './logic.ts';

// JWT-gated (deploy with verify ON — the caller always has a session when they
// erase). This is the half of erasure that SQL cannot do: `delete_my_data()`
// (021_erasure_honesty.sql) clears the caller's room data, swipes and recovery
// rows, but it cannot reach the `auth.users` row that holds their email. Until
// this function runs, the erasure promise at lib/legal/content/privacy.ts:87-102
// is not met.
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = req.headers.get('Authorization');
    const jwt = bearerToken(authHeader);
    if (!jwt) return fail('auth');

    // Client 1 — the CALLER. `delete_my_data()` is scoped entirely by
    // auth.uid(): it decides which member row, which room, which recovery codes.
    // Run as service_role, auth.uid() is NULL and 021 raises `not_authenticated`
    // — so this client, carrying the caller's own JWT, is the only one that may
    // invoke it.
    const caller = createClient(SB_URL, SB_ANON, {
      global: { headers: { Authorization: authHeader! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Identity comes from the verified token and nowhere else — the request body
    // is never read, so a caller has no way to name someone else's account.
    const { data: userData, error: userErr } = await caller.auth.getUser(jwt);
    const uid = tokenUid(userData?.user ?? null);
    if (userErr || !uid) return fail('auth');

    // ORDER IS LOAD-BEARING: data first, account last.
    // If the auth-user delete below fails after this succeeded, the user's room
    // data is gone but their login still works — they keep a session that can
    // retry, and retrying is harmless (delete_my_data is idempotent). The
    // reverse order has no such recovery: deleting the auth user first destroys
    // the only session whose auth.uid() can ever reach that room data, orphaning
    // it permanently.
    const { error: rpcErr } = await caller.rpc('delete_my_data');
    if (rpcErr) {
      console.error('delete-account: delete_my_data failed', rpcErr.message);
      return fail('data');
    }

    // Client 2 — service_role, and only now. Deleting an auth.users row is an
    // admin-API-only operation; nothing below this point touches user data.
    const svc = createClient(SB_URL, SB_SVC);
    const { error: delErr } = await svc.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error('delete-account: deleteUser failed', delErr.message);
      return fail('account');
    }

    return json({ ok: true }, 200);
  } catch (e) {
    console.error('delete-account failed', e instanceof Error ? e.message : e);
    return fail('server');
  }
});

function fail(stage: Parameters<typeof failure>[0]) {
  const { status, body }: FailureResponse = failure(stage);
  return json(body, status);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
