// ============================================================
// stores/authStore.ts — Auth state (Zustand)
// ============================================================
import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import { authApi, wakeBackend } from '@/services/api';
import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import type { User } from '@/types';

/** Cold Render / flaky Wi‑Fi: first /auth/me often fails — retry before giving up. */
async function fetchMeWithRetry(maxAttempts = 5): Promise<User | null> {
  let last: User | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data } = await authApi.me().catch(() => ({ data: null }));
    last = (data?.data as User | null) ?? null;
    if (last) return last;
    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
  }
  return last;
}

const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

interface AuthState {
  user: User | null;
  session: any | null;
  isLoading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const user = await fetchMeWithRetry();
        set({ session, user });
        if (!user) {
          void wakeBackend().finally(() => {
            void get().refreshUser();
          });
        }
      } else {
        set({ session: null, user: null });
      }
      set({ isInitialized: true });
    } catch {
      set({ session: null, user: null, isInitialized: true });
    }

    // Listen to Supabase auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session });
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        const { data } = await authApi.me().catch(() => ({ data: null }));
        // Never wipe profile on transient /auth/me failure (would blank Profile tab after login).
        const prev = get().user;
        set({ user: data?.data ?? prev });
      }
      if (event === 'SIGNED_OUT') {
        set({ user: null, session: null });
      }
    });
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      await wakeBackend();
      const resp = await withTimeout(authApi.login({ email, password }), 30000, 'Login');
      const session =
        resp?.data?.data?.session ??
        resp?.data?.session ??
        null;

      if (!session?.access_token || !session?.refresh_token) {
        throw new Error(resp?.data?.error ?? 'Login failed (missing session)');
      }

      // Immediately store the backend-issued token so our axios interceptor can
      // attach Authorization headers even if Supabase's `setSession` is slow.
      setAccessToken(session.access_token);

      // Fire-and-forget: Supabase `setSession` can hang in some environments.
      void withTimeout(
        supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
        12000,
        'Supabase session',
      ).catch(() => {});

      // Use the user returned by the backend to avoid an extra `/auth/me` round-trip
      // (which depends on Authorization + anon-key behavior).
      const user = resp?.data?.data?.user ?? resp?.data?.user ?? null;
      set({ user: user ?? null, session });
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email: string, password: string, username: string) => {
    set({ isLoading: true });
    try {
      await wakeBackend();
      const resp = await withTimeout(authApi.register({ email, password, username }), 30000, 'Registration');
      const session =
        resp?.data?.data?.session ??
        resp?.data?.session ??
        null;

      if (!session?.access_token || !session?.refresh_token) {
        throw new Error(resp?.data?.error ?? 'Registration failed (missing session)');
      }

      setAccessToken(session.access_token);

      // Fire-and-forget Supabase session setup to prevent UI hangs.
      void withTimeout(
        supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
        12000,
        'Supabase session',
      ).catch(() => {});

      const user = resp?.data?.data?.user ?? resp?.data?.user ?? null;
      set({ user: user ?? null, session });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore: signOut can fail if the anon key is invalid
    }
    clearAccessToken();
    set({ user: null, session: null });
  },

  setUser: (user) => set({ user }),

  refreshUser: async () => {
    const { data } = await authApi.me().catch(() => ({ data: null }));
    if (data?.data) set({ user: data.data });
  },
}));
