import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True when both env vars are present. The app runs without them in an offline
 * dev mode (seed data + in-memory room), so we expose a flag instead of throwing.
 */
export const supabaseEnabled = !!(url && anon);

const KEY_PREFIX = 'sb-';
const cleanKey = (k: string) => KEY_PREFIX + k.replace(/[^a-zA-Z0-9._-]/g, '_');

/** Native: expo-secure-store, namespaced with the sb- prefix. */
/* istanbul ignore next -- platform storage glue, exercised on-device not in jsdom */
const secureStoreAdapter = {
  getItem: (k: string) => SecureStore.getItemAsync(cleanKey(k)),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(cleanKey(k), v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(cleanKey(k)),
};

/** Web: localStorage, guarded for static (no-window) render passes. */
/* istanbul ignore next -- platform storage glue, exercised in a real browser not jsdom */
const webStorageAdapter = {
  getItem: async (k: string) =>
    typeof window !== 'undefined' ? window.localStorage.getItem(k) : null,
  setItem: async (k: string, v: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(k, v);
  },
  removeItem: async (k: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(k);
  },
};

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url as string, anon as string, {
      auth: {
        storage: Platform.OS === 'web' ? webStorageAdapter : secureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

// Auto-refresh tied to app foreground/background — native only.
/* istanbul ignore next -- native AppState wiring, no-ops under the web test env */
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
