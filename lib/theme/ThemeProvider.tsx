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

export const STORAGE_KEY = 'matchpoint-theme-preference';

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
  /** True once the stored preference has been read (or failed to be). */
  hydrated: boolean;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the persisted preference once on mount.
  useEffect(() => {
    let mounted = true;
    // Through a promise so a synchronous throw (blocked localStorage) still
    // reaches .finally — the web render stays forced light until hydrated.
    Promise.resolve()
      .then(() => preferenceStore.get())
      .then((v) => {
        if (mounted && isPreference(v)) setPreferenceState(v);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    preferenceStore.set(p);
  }, []);

  const resolved: Scheme = preference === 'system' ? systemScheme : preference;
  // Web pages are pre-rendered light at build time. Hydration must render the
  // same, or React keeps the server's light inline styles under dark ones and
  // the page sticks half-themed. The real scheme follows once hydrated, while
  // the +html.tsx boot script keeps a dark visitor's page hidden.
  const scheme: Scheme = Platform.OS === 'web' && !hydrated ? 'light' : resolved;

  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, preference, setPreference, hydrated }),
    [scheme, preference, setPreference, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Preference + resolved scheme + setter. Used by ThemeToggle. */
export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used inside ThemeProvider');
  return ctx;
}
