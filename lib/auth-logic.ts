export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
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
