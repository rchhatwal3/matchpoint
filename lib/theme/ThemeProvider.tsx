import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** User's stored choice. 'system' follows the OS light/dark setting. */
export type ThemePreference = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

const STORAGE_KEY = 'matchpoint-theme-preference';

const isPreference = (v: unknown): v is ThemePreference =>
  v === 'system' || v === 'light' || v === 'dark';

/**
 * Persistence adapter, same Platform.OS split as lib/supabase.ts:
 * expo-secure-store on native, localStorage on web (guarded for no-window
 * render passes). Async on both so the call site stays uniform.
 */
const preferenceStore = {
  get: (): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(
          typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null,
        )
      : SecureStore.getItemAsync(STORAGE_KEY),
  set: (v: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, v);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(STORAGE_KEY, v);
  },
};

export type ThemeContextValue = {
  /** Resolved light/dark actually in effect (system → OS setting). */
  scheme: Scheme;
  /** User's stored preference. */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // Hydrate the persisted preference once on mount.
  useEffect(() => {
    let mounted = true;
    preferenceStore.get().then((v) => {
      if (mounted && isPreference(v)) setPreferenceState(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    preferenceStore.set(p);
  }, []);

  const scheme: Scheme = preference === 'system' ? systemScheme : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, preference, setPreference }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Preference + resolved scheme + setter. Used by ThemeToggle. */
export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used inside ThemeProvider');
  return ctx;
}
