import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';
import {
  hashCode,
  isIpOverLimit,
  isLockedOut,
  isValidEmail,
  lastForwardedIp,
  LOCKOUT_WINDOW_MS,
  normalizeCode,
  timingSafeEqual,
} from './logic.ts';

// UNAUTHENTICATED (deploy with --no-verify-jwt). This is the whole point: the
// user has no session — a saved recovery code + their email mints one, for the
// SAME auth.uid (so the room survives) via admin generateLink, no inbox, no
// password. Being open makes it the primary attack surface; it is compensated,
// not left open — per-email lockout here + CAPTCHA/rate limits (T16b) at the edge.
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// One generic failure for every wrong-email / wrong-code / locked path — no
// account enumeration, near-constant response shape. Expected user-facing
// failures return HTTP 200 with this in the body: supabase.functions.invoke
// collapses any non-2xx into a generic "non-2xx status" error and drops the body,
// so a 4xx here would hide the message from the user. Only true faults are non-2xx.
const GENERIC = 'That email and recovery code did not match. Check them and try again.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const code = typeof body.code === 'string' ? normalizeCode(body.code) : '';
    if (!email || !code || !isValidEmail(email)) return json({ error: GENERIC }, 400);
    const ip = lastForwardedIp(req.headers.get('x-forwarded-for'));

    const svc = createClient(SB_URL, SB_SVC);

    // Throttle first: too many recent failures for this email -> locked.
    const cutoffIso = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
    const { data: fails } = await svc
      .from('recovery_redeem_attempts')
      .select('attempted_at')
      .eq('email', email)
      .eq('success', false)
      .gte('attempted_at', cutoffIso);
    if (isLockedOut((fails ?? []).map((f) => Date.parse(f.attempted_at as string)), Date.now())) {
      return json({ error: 'Too many attempts. Wait 15 minutes and try again.' });
    }

    // Resolve the email to a user id (definer helper — auth.users is unreachable
    // via PostgREST). Unknown email: same fail() path as a wrong code, so an
    // unregistered email accumulates lockout state identically to a registered
    // one — otherwise the two are distinguishable by the sixth request (see
    // docs/security/2026-07-27-adversarial-qa.md, P2 enumeration finding).
    const { data: uid } = await svc.rpc('user_id_for_email', { p_email: email });
    if (!uid) return await fail(svc, email, ip);

    // Find a matching unused code by recomputing the hash per row salt.
    const { data: rows } = await svc
      .from('recovery_codes')
      .select('id, code_hash, salt')
      .eq('user_id', uid)
      .is('used_at', null);
    let matchId: string | null = null;
    for (const row of rows ?? []) {
      const h = await hashCode(code, row.salt as string);
      if (timingSafeEqual(h, row.code_hash as string)) {
        matchId = row.id as string;
        break;
      }
    }
    if (!matchId) return await fail(svc, email, ip);

    // Single-use, race-safe consume: only the writer that flips used_at wins.
    const { data: consumed } = await svc
      .from('recovery_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', matchId)
      .is('used_at', null)
      .select('id');
    if (!consumed || consumed.length === 0) return await fail(svc, email, ip);

    // Mint a session without sending email: generateLink returns a hashed magic-
    // link token the client verifies with verifyOtp({ token_hash }).
    const { data: link, error: linkErr } = await svc.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) throw linkErr ?? new Error('generateLink returned no token');

    await svc.from('recovery_redeem_attempts').insert({ email, success: true });
    return json({ token_hash: tokenHash, email });
  } catch (e) {
    console.error('redeem-recovery-code failed', e instanceof Error ? e.message : e);
    return json({ error: GENERIC }, 500);
  }
});

// Record a failed attempt (feeds the lockout) and return the generic error (200
// so the client can surface it — see the GENERIC note above). A rotating,
// never-repeating "unknown email" never trips the per-email lockout, so this
// also caps writes per caller IP: over the recent-failure threshold for this
// IP, skip the insert entirely (still returns the same generic response —
// same observable behavior to the caller, no enumeration signal, just no row).
// Unknown IP (missing/unparseable header, ip === null) is deliberately NOT
// throttled here and always falls through to the insert below: exempting it
// keeps the existing per-email lockout fully intact for that traffic, at the
// accepted cost that a caller able to suppress the header still writes
// unbounded rows (residual risk, not an oversight).
async function fail(svc: SupabaseClient, email: string, ip: string | null) {
  if (ip !== null) {
    const cutoffIso = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
    const { data: ipFails } = await svc
      .from('recovery_redeem_attempts')
      .select('attempted_at')
      .eq('ip', ip)
      .eq('success', false)
      .gte('attempted_at', cutoffIso);
    if (isIpOverLimit((ipFails ?? []).map((f) => Date.parse(f.attempted_at as string)), Date.now())) {
      return json({ error: GENERIC });
    }
  }
  await svc.from('recovery_redeem_attempts').insert({ email, success: false, ip });
  return json({ error: GENERIC });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
