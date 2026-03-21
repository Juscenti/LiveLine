// ============================================================
// services/supabase.ts — Supabase client (singleton)
// ============================================================
import '@/utils/devConsoleFilterInstall';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { rewriteLocalhostForAndroidEmulator } from '@/utils/devNetwork';

/** Windows .env often adds \\r; BOM breaks URL parsing — both break the anon JWT "apikey" header. */
function normalizeEnv(s: string): string {
  return s.replace(/^\uFEFF/, '').trim().replace(/\r$/, '');
}

function isPlausibleSupabaseAnonKey(key: string): boolean {
  if (!key) return false;
  // New hosted keys (see Supabase Settings → API Keys)
  if (key.startsWith('sb_publishable_')) return true;
  // Legacy anon / service JWT
  return key.split('.').length === 3;
}

const SUPABASE_URL = rewriteLocalhostForAndroidEmulator(
  normalizeEnv(process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''),
);
const SUPABASE_ANON_KEY = normalizeEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '');

// Fail fast if env vars were not injected into the JS bundle.
if (!SUPABASE_URL) {
  throw new Error('Missing env: EXPO_PUBLIC_SUPABASE_URL');
}
if (!SUPABASE_ANON_KEY) {
  throw new Error('Missing env: EXPO_PUBLIC_SUPABASE_ANON_KEY');
}
if (!isPlausibleSupabaseAnonKey(SUPABASE_ANON_KEY)) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY must be the anon JWT (legacy) or publishable key (sb_publishable_…) from Supabase → Settings → API.',
  );
}

// Use SecureStore on device, localStorage on web
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
    SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
    SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter as any,
    /** Must stay on so access tokens refresh while the app is open; otherwise users re-login constantly. */
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
