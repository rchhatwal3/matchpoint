// Pure helpers for the delete-account edge function. Side-effect-free (no
// Deno.serve) so they can be unit-tested with `deno test`.

// How far an erasure got before it stopped. This is the ONLY input to the
// response body: a stage cannot carry upstream error text, so an RPC or admin
// error message can never reach the caller (the open P3 against get-restaurants
// is exactly that leak — it returns `e.message` verbatim). Upstream detail is
// logged server-side instead.
export type Stage = 'auth' | 'data' | 'account' | 'server';

export type FailureResponse = {
  status: number;
  body: { ok: false; stage: Stage; error: string };
};

// `data` and `account` are expected, user-facing failures, so they are HTTP 200
// with the message in the body: supabase.functions.invoke collapses any non-2xx
// into a generic "non-2xx status" error and drops the body, which is what forced
// the redeem-recovery-code redeploy (MANUAL_TODOS.md:135). A 4xx here would hide
// the message from the person trying to delete their account.
//
// `auth` keeps the 401 the neighbouring functions return, and `server` is a true
// fault; in both cases there is nothing to surface beyond "try again", so losing
// the body to invoke costs nothing.
const FAILURES: Record<Stage, { status: number; error: string }> = {
  auth: { status: 401, error: 'Unauthorized' },
  data: {
    status: 200,
    error: 'Could not delete your data. Nothing was deleted — please try again.',
  },
  // Deliberately specific: this is the one half-done state the order below can
  // produce, and the user needs to know their room data is already gone and that
  // retrying is what finishes the job.
  account: {
    status: 200,
    error: 'Your data was deleted, but your login could not be removed. Please try again to finish.',
  },
  server: { status: 500, error: 'Could not delete your account. Please try again.' },
};

export function failure(stage: Stage): FailureResponse {
  const { status, error } = FAILURES[stage];
  return { status, body: { ok: false, stage, error } };
}

// The `Authorization: Bearer <jwt>` the request must carry. JWT verification is
// ON for this function, so the platform rejects a missing or malformed token
// before it reaches us; this is the backstop, and the only door identity comes
// through.
export function bearerToken(header: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec((header ?? '').trim());
  return match ? match[1] : null;
}

// The account to erase is whatever the verified token says, full stop — the
// request body is never read, so nothing a caller sends can name someone else's
// account.
export function tokenUid(tokenUser: { id?: unknown } | null): string | null {
  const id = tokenUser?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
