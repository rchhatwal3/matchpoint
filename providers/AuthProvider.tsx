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

type AuthValue = {
  email: string | null;
  isAnonymous: boolean;
  enabled: boolean;
  sendUpgradeCode: (email: string) => Promise<void>;
  sendSignInCode: (email: string) => Promise<void>;
  verifyCode: (email: string, token: string, mode: 'email_change' | 'email') => Promise<void>;
  signOut: () => Promise<void>;
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

  const value = useMemo<AuthValue>(
    () => ({
      email,
      isAnonymous,
      enabled: supabaseEnabled,
      sendUpgradeCode,
      sendSignInCode,
      verifyCode,
      signOut,
    }),
    [email, isAnonymous, sendUpgradeCode, sendSignInCode, verifyCode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
