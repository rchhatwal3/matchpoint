-- 024_recovery_attempts_ip_rate_limit.sql
-- P1 (2026-07-28 security review): redeem-recovery-code is unauthenticated
-- (--no-verify-jwt by design). Shape validation on the submitted email closes
-- the malformed-input path, but a well-formed, unknown, freshly-random email
-- (a1b2c3@x.com, d4e5f6@x.com, ...) still reaches fail() and inserts a row
-- every time. The per-email lockout (011) never trips because no single email
-- repeats, so it alone cannot bound the table. This adds a second cap keyed on
-- the caller's IP (from X-Forwarded-For), so growth is bounded by threshold x
-- distinct IPs x window instead of being unbounded — the 30-day purge (021)
-- can keep pace with that.

ALTER TABLE recovery_redeem_attempts ADD COLUMN IF NOT EXISTS ip text;

CREATE INDEX IF NOT EXISTS recovery_redeem_attempts_ip_idx
  ON recovery_redeem_attempts (ip, attempted_at, success);
