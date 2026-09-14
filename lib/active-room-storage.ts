import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Which room this device last had open. Per-device on purpose: it is a UI
 * preference, and storing it on `rooms` or `members` would sync one device's
 * navigation to the other and cost a write per switch.
 *
 * Mirrors the adapter split in lib/supabase.ts — SecureStore on native,
 * localStorage on web, both guarded for no-window render passes.
 */
const KEY = 'matchpoint.activeRoom';

/* istanbul ignore next -- platform storage glue, exercised on-device and in a real browser, not jsdom */
export async function readActiveRoom(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
  }
  return SecureStore.getItemAsync(KEY);
}

/* istanbul ignore next -- platform storage glue, exercised on-device and in a real browser, not jsdom */
export async function writeActiveRoom(roomId: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    if (roomId) window.localStorage.setItem(KEY, roomId);
    else window.localStorage.removeItem(KEY);
    return;
  }
  if (roomId) await SecureStore.setItemAsync(KEY, roomId);
  else await SecureStore.deleteItemAsync(KEY);
}
