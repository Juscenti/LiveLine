// ============================================================
// stores/authStore.ts — Auth state (Zustand)
// ============================================================
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { authApi, wakeBackend } from '@/services/api';
import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import type { User } from '@/types';

/** Only register Supabase listener once (initialize must not stack listeners on re-entry). */
let supabaseAuthListenerRegistered = false;

/** Cold Render / flaky Wi‑Fi — bounded retries; does not stack with UI-level refresh calls. */
async function fetchMeWithRetry(maxAttempts = 2): Promise<User | null> {
  let last: User | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await authApi.me();
      const body = res?.data as { data?: User } | undefined;
      last = body?.data ?? null;
      if (last) return last;
    } catch {
      last = null;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 280 * (attempt + 1)));
    }
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
  session: Session | null;
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
    if (!supabaseAuthListenerRegistered) {
      supabaseAuthListenerRegistered = true;
      supabase.auth.onAuthStateChange(async (event, session) => {
        set({ session });

        if (event === 'SIGNED_OUT') {
          clearAccessToken();
          set({ user: null, session: null });
          return;
        }

        if (session?.access_token) setAccessToken(session.access_token);

        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          const res = await authApi.me().catch(() => null);
          const prev = get().user;
          const u = (res?.data as { data?: User } | undefined)?.data;
          set({ user: u ?? prev });
        }
      });
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) setAccessToken(session.access_token);
      if (session) {
        set({ session, user: get().user });
        set({ isInitialized: true });

        void (async () => {
          await wakeBackend().catch(() => {});
          const user = await fetchMeWithRetry(2);
          set({ user: user ?? get().user });
        })();
      } else {
        clearAccessToken();
        set({ session: null, user: null, isInitialized: true });
      }
    } catch {
      clearAccessToken();
      set({ session: null, user: null, isInitialized: true });
    }
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

      setAccessToken(session.access_token);

      await withTimeout(
        supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
        20000,
        'Supabase session',
      );

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

      await withTimeout(
        supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
        20000,
        'Supabase session',
      );

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
    const res = await authApi.me().catch(() => null);
    const u = (res?.data as { data?: User } | undefined)?.data;
    if (u) set({ user: u });
  },
}));
