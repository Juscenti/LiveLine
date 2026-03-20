// ============================================================
// stores/authStore.ts — Auth state (Zustand)
// ============================================================
import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import { authApi } from '@/services/api';
import type { User } from '@/types';

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
        const { data } = await authApi.me().catch(() => ({ data: null }));
        set({ session, user: data?.data ?? null });
      } else {
        set({ session: null, user: null });
      }
      set({ isInitialized: true });
    } catch {
      // If auth initialization fails (e.g., transient network), still allow the app to render.
      set({ session: null, user: null, isInitialized: true });
    }

    // Listen to Supabase auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session });
      if (event === 'SIGNED_IN' && session) {
        const { data } = await authApi.me().catch(() => ({ data: null }));
        set({ user: data?.data ?? null });
      }
      if (event === 'SIGNED_OUT') {
        set({ user: null, session: null });
      }
    });
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const resp = await authApi.login({ email, password });
      const session =
        resp?.data?.data?.session ??
        resp?.data?.session ??
        null;

      if (!session?.access_token || !session?.refresh_token) {
        throw new Error(resp?.data?.error ?? 'Login failed (missing session)');
      }

      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

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
      const resp = await authApi.register({ email, password, username });
      const session =
        resp?.data?.data?.session ??
        resp?.data?.session ??
        null;

      if (!session?.access_token || !session?.refresh_token) {
        throw new Error(resp?.data?.error ?? 'Registration failed (missing session)');
      }

      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

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
    set({ user: null, session: null });
  },

  setUser: (user) => set({ user }),

  refreshUser: async () => {
    const { data } = await authApi.me().catch(() => ({ data: null }));
    if (data?.data) set({ user: data.data });
  },
}));
