import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { allPriceTiers, parsePriceTiers, serializePriceTiers } from './price-filter';

const STORAGE_KEY = 'matchpoint-price-tiers';

/**
 * Persistence adapter — same Platform.OS split as lib/theme/ThemeProvider:
 * expo-secure-store on native, localStorage on web (guarded for no-window
 * render passes).
 */
const store = {
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

/**
 * Persisted restaurant price-tier selection (per-user, per-device — mirrors the
 * theme override). Hydrates from the store on mount so the choice survives deck
 * revisits; toggling persists immediately. Pure serialize/parse/filter logic
 * lives in ./price-filter (unit-tested); this thin I/O wrapper is excluded from
 * coverage like the theme provider.
 */
export function usePriceLevels() {
  const [priceLevels, setPriceLevels] = useState<Set<number>>(allPriceTiers);

  useEffect(() => {
    let mounted = true;
    store.get().then((v) => {
      if (mounted) setPriceLevels(parsePriceTiers(v));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const toggle = useCallback((level: number) => {
    setPriceLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      // Persist here (only on a real toggle, never on mount) so hydration and
      // persistence can't race. StrictMode may double-invoke this updater, but
      // the write is the same serialized value twice — idempotent.
      store.set(serializePriceTiers(next));
      return next;
    });
  }, []);

  return { priceLevels, toggle };
}
