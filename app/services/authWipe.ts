// ============================================================
// Nuclear wipe of all client-side auth + session artifacts.
// Trigger once with EXPO_PUBLIC_NUCLEAR_AUTH_WIPE_ON_LAUNCH=1 in app/.env, reload, then remove the line.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { queryClient } from '@/queryClient';
import { clearAccessToken } from '@/services/accessTokenStore';
import { supabase, supabaseAuthStorageKeysForWipe } from '@/services/supabase';
import { useFriendsInboxStore } from '@/stores/friendsInboxStore';
import { useMusicStore } from '@/stores/musicStore';
import { useNotificationStore } from '@/stores/notificationStore';

function scrubWebLocalStorageAuthKeys() {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith('sb-') || k.includes('supabase') || k.startsWith('liveline-supabase')) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
}

async function deleteSecureStoreKeys(keys: string[]) {
  for (const k of keys) {
    try {
      await SecureStore.deleteItemAsync(k);
    } catch {
      // missing key / platform quirks
    }
  }
}

async function scrubAsyncStorageAppCaches() {
  try {
    const all = await AsyncStorage.getAllKeys();
    const kill = all.filter((k) => {
      if (k === 'spotify-oauth-callback-code') return true;
      if (k.startsWith('liveline.auth_epoch.')) return false;
      return k.startsWith('liveline.') || k.startsWith('liveline_');
    });
    if (kill.length) await AsyncStorage.multiRemove(kill);
  } catch {
    // ignore
  }
}

export function shouldNuclearWipeAuthOnLaunch(): boolean {
  const v = (process.env.EXPO_PUBLIC_NUCLEAR_AUTH_WIPE_ON_LAUNCH ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Bump this when you need every install to wipe local auth once (e.g. after a Supabase reset).
 * Survives Expo --clear; uses AsyncStorage marker per device.
 */
const CLIENT_AUTH_WIPE_EPOCH = 'scratch-2026-03-28';

function clientAuthEpochMarkerKey() {
  return `liveline.auth_epoch.${CLIENT_AUTH_WIPE_EPOCH}`;
}

/** Returns true if a wipe ran (first launch after epoch bump). */
export async function applyOneTimeClientAuthEpochWipe(): Promise<boolean> {
  try {
    const k = clientAuthEpochMarkerKey();
    const done = await AsyncStorage.getItem(k);
    if (done) return false;
    await nuclearWipeLocalAuthState();
    await AsyncStorage.setItem(k, '1');
    return true;
  } catch {
    return false;
  }
}

/** Clears Supabase session persistence, API bearer cache, Zustand slices, React Query, and related AsyncStorage. */
export async function nuclearWipeLocalAuthState(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // ignore
  }

  clearAccessToken();

  const storageKeys = supabaseAuthStorageKeysForWipe();
  if (Platform.OS === 'web') {
    for (const k of storageKeys) {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    }
    scrubWebLocalStorageAuthKeys();
  } else {
    await deleteSecureStoreKeys(storageKeys);
  }

  await scrubAsyncStorageAppCaches();

  useFriendsInboxStore.getState().clear();
  useMusicStore.getState().resetMusicSession();
  useNotificationStore.getState().reset();

  queryClient.clear();
}
