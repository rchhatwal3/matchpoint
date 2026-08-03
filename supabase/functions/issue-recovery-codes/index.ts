import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';
import { CODE_COUNT, hashCode, newCode, newSalt } from './logic.ts';

// JWT-gated (deploy with verify ON): issues a fresh set of recovery codes for the
// calling permanent user. Returns the plaintext codes ONCE — they are only ever
// stored as salted hashes, never logged. Regenerating voids the prior set.
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SB_SVC = Deno.env.get('SB_SECRET_KEY');
if (!SB_SVC) throw new Error('Missing required secret: SB_SECRET_KEY');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Unauthorized' }, 401);

    // Client 1 — the CALLER. Verifying the caller's own token is not an admin
    // operation, and identity comes from the verified token and nowhere else,
    // so the request body can never name someone else's account.
    const caller = createClient(SB_URL, SB_ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
    const user = userData.user;

    // Recovery codes are permanent-account-only: an anonymous session has no
    // durable identity to recover to.
    if (user.is_anonymous || !user.email) {
      return json({ error: 'Recovery codes require a permanent (email) account' }, 403);
    }

    const codes = Array.from({ length: CODE_COUNT }, () => newCode());
    const rows = await Promise.all(
      codes.map(async (code) => {
        const salt = newSalt();
        return { user_id: user.id, code_hash: await hashCode(code, salt), salt };
      }),
    );

    // Client 2 — service_role, for one operation that needs it:
    // `replace_recovery_codes` is a SECURITY DEFINER RPC revoked from public
    // and granted to service_role alone (022_p3_hardening.sql:174-175).
    // Void the old set and insert the new one atomically (regenerate = replace).
    const svc = createClient(SB_URL, SB_SVC);
    const { error: rpcErr } = await svc.rpc('replace_recovery_codes', {
      p_user: user.id,
      p_rows: rows,
    });
    if (rpcErr) throw rpcErr;

    return json({ codes });
  } catch (e) {
    console.error('issue-recovery-codes failed', e instanceof Error ? e.message : e);
    return json({ error: 'Could not generate recovery codes. Try again.' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
