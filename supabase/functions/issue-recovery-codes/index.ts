import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';
import { CODE_COUNT, hashCode, newCode, newSalt } from './logic.ts';

// JWT-gated (deploy with verify ON): issues a fresh set of recovery codes for the
// calling permanent user. Returns the plaintext codes ONCE — they are only ever
// stored as salted hashes, never logged. Regenerating voids the prior set.
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const svc = createClient(SB_URL, SB_SVC);

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
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

    // Void the old set, then insert the new one (regenerate = replace).
    const del = await svc.from('recovery_codes').delete().eq('user_id', user.id);
    if (del.error) throw del.error;
    const ins = await svc.from('recovery_codes').insert(rows);
    if (ins.error) throw ins.error;

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
