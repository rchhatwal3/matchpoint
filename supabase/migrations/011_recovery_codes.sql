-- 011_recovery_codes.sql
-- Lost-email account recovery (T9 Phase B). Passwordless email OTP makes the
-- inbox the ONLY key to a permanent account; lose it with no live device session
-- and the room + matches are unrecoverable. Recovery codes give every permanent
-- account a self-service, inbox-free, second-vendor-free way back in: email + one
-- saved code mints a session for the SAME auth.uid (so the room survives) via the
-- redeem-recovery-code edge function.

-- Only salted hashes are stored; plaintext codes exist once, in the issue
-- response, never here. Touched ONLY by the service_role edge functions.
CREATE TABLE recovery_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,          -- sha256(salt || code), hex
  salt       text NOT NULL,          -- per-code random, hex
  used_at    timestamptz,            -- null = unused
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_codes_user_idx ON recovery_codes (user_id);

-- Per-email failed-redeem history for the 5-fails / 15-min lockout enforced in
-- the redeem-recovery-code edge function (the unauthenticated redeem endpoint is
-- the brute-force surface). Service_role only.
CREATE TABLE recovery_redeem_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success      boolean NOT NULL DEFAULT false
);
CREATE INDEX recovery_redeem_attempts_email_idx
  ON recovery_redeem_attempts (email, attempted_at);

-- RLS on, no policies: default-deny to anon/authenticated. The service_role
-- bypasses RLS but still needs table GRANTs on new projects (see 007). The only
-- client-visible read is recovery_codes_remaining() below.
ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_redeem_attempts ENABLE ROW LEVEL SECURITY;

-- Count the caller's unused codes — never the hashes. The one thing the client
-- may know is how many recovery codes remain.
CREATE OR REPLACE FUNCTION recovery_codes_remaining() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM recovery_codes
  WHERE user_id = auth.uid() AND used_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION recovery_codes_remaining() TO authenticated;

-- Resolve an email to its auth user id for the redeem edge function. The email
-- has no session at redeem time, so PostgREST/RLS can't reach auth.users — this
-- definer helper does, and is granted to service_role ONLY (never a client role),
-- so it is not an email-enumeration oracle for anon/authenticated.
CREATE OR REPLACE FUNCTION user_id_for_email(p_email text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM auth.users WHERE email = lower(trim(p_email)) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION user_id_for_email(text) FROM public;
GRANT EXECUTE ON FUNCTION user_id_for_email(text) TO service_role;

-- Edge functions run as service_role with no implicit table privileges (see 007).
-- Grant exactly what each function does.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_codes TO service_role;
GRANT SELECT, INSERT ON public.recovery_redeem_attempts TO service_role;
