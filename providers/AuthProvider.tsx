import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase, supabaseEnabled } from '@/lib/supabase';
import { normalizeEmail } from '@/lib/auth-logic';
import { normalizeCode } from '@/lib/recovery-logic';

type AuthValue = {
  email: string | null;
  isAnonymous: boolean;
  enabled: boolean;
  sendUpgradeCode: (email: string) => Promise<void>;
  sendSignInCode: (email: string) => Promise<void>;
  verifyCode: (email: string, token: string, mode: 'email_change' | 'email') => Promise<void>;
  signOut: () => Promise<void>;
  issueRecoveryCodes: () => Promise<string[]>;
  redeemRecoveryCode: (email: string, code: string) => Promise<void>;
  codesRemaining: () => Promise<number>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  // Default true: an unupgraded session is anonymous. Offline mode never upgrades.
  const [isAnonymous, setIsAnonymous] = useState(true);

  useEffect(() => {
    if (!supabaseEnabled || !supabase) return;
    const client = supabase;
    const apply = (user: { email?: string | null; is_anonymous?: boolean } | null | undefined) => {
      setEmail(user?.email ?? null);
      setIsAnonymous(user?.is_anonymous ?? !user?.email);
    };
    client.auth.getUser().then(({ data }) => apply(data.user)).catch(() => {});
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      apply(session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const sendUpgradeCode = useCallback(async (raw: string) => {
    if (!supabase) throw new Error('Auth unavailable offline');
    const { error } = await supabase.auth.updateUser({ email: normalizeEmail(raw) });
    if (error) throw error;
  }, []);

  const sendSignInCode = useCallback(async (raw: string) => {
    if (!supabase) throw new Error('Auth unavailable offline');
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizeEmail(raw),
      options: { shouldCreateUser: false },
    });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(
    async (raw: string, token: string, mode: 'email_change' | 'email') => {
      if (!supabase) throw new Error('Auth unavailable offline');
      const { error } = await supabase.auth.verifyOtp({
        email: normalizeEmail(raw),
        token: token.trim(),
        type: mode,
      });
      if (error) throw error;
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error('Auth unavailable offline');
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // Issue a fresh set of recovery codes for the permanent user (JWT-gated edge
  // function). Returns the plaintext codes to show once; regenerating voids the
  // prior set.
  const issueRecoveryCodes = useCallback(async () => {
    if (!supabase) throw new Error('Auth unavailable offline');
    const { data, error } = await supabase.functions.invoke('issue-recovery-codes');
    if (error) throw error;
    return (data?.codes ?? []) as string[];
  }, []);

  // Recover a locked-out account with only email + a saved code: the edge
  // function returns a magic-link token_hash, which verifyOtp exchanges for a
  // session (same uid -> the SessionProvider auth listener reloads the room).
  const redeemRecoveryCode = useCallback(async (rawEmail: string, rawCode: string) => {
    if (!supabase) throw new Error('Auth unavailable offline');
    const { data, error } = await supabase.functions.invoke('redeem-recovery-code', {
      body: { email: normalizeEmail(rawEmail), code: normalizeCode(rawCode) },
    });
    if (error) throw error;
    const tokenHash = data?.token_hash as string | undefined;
    if (!tokenHash) throw new Error(data?.error ?? 'Recovery failed. Check your email and code.');
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    });
    if (verifyErr) throw verifyErr;
  }, []);

  // How many unused recovery codes the permanent user has left.
  const codesRemaining = useCallback(async () => {
    if (!supabase) return 0;
    const { data, error } = await supabase.rpc('recovery_codes_remaining');
    if (error) throw error;
    return (data ?? 0) as number;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      email,
      isAnonymous,
      enabled: supabaseEnabled,
      sendUpgradeCode,
      sendSignInCode,
      verifyCode,
      signOut,
      issueRecoveryCodes,
      redeemRecoveryCode,
      codesRemaining,
    }),
    [
      email,
      isAnonymous,
      sendUpgradeCode,
      sendSignInCode,
      verifyCode,
      signOut,
      issueRecoveryCodes,
      redeemRecoveryCode,
      codesRemaining,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
