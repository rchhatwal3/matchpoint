export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Expected length of the email OTP. Single source of truth — the Supabase
 * project's "Email OTP Length" setting must match this number. */
export const OTP_CODE_LENGTH = 6;

const CODE_RE = new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`);

export function isValidCode(code: string): boolean {
  return CODE_RE.test(code.trim());
}

/** Hint for the code-entry field: null while empty or once the code is valid,
 * otherwise a specific message explaining why it's wrong (instead of a
 * silently disabled Verify button). */
export function codeEntryHint(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.length === 0 || isValidCode(trimmed)) return null;
  return `Enter the ${OTP_CODE_LENGTH}-digit code from your email.`;
}

export type AuthScreenState = 'anonymous' | 'code-sent' | 'permanent';

/** Which /account view to show, from auth + local "code sent" flag. */
export function authView(s: {
  isAnonymous: boolean;
  email: string | null;
  codeSent: boolean;
}): AuthScreenState {
  if (!s.isAnonymous && s.email) return 'permanent';
  if (s.codeSent) return 'code-sent';
  return 'anonymous';
}
