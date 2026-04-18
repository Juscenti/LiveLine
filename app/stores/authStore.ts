// ============================================================
// stores/authStore.ts — Auth state (Zustand)
// ============================================================
import { create } from 'zustand';
import axios from 'axios';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { authApi, wakeBackend } from '@/services/api';
import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import {
  applyOneTimeClientAuthEpochWipe,
  nuclearWipeLocalAuthState,
  shouldNuclearWipeAuthOnLaunch,
} from '@/services/authWipe';
import { useFriendsInboxStore } from '@/stores/friendsInboxStore';
import { useMusicStore } from '@/stores/musicStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useFeedStore } from '@/stores/feedStore';
import { useMapStore } from '@/stores/mapStore';
import type { User } from '@/types';

/** Only register Supabase listener once (initialize must not stack listeners on re-entry). */
let supabaseAuthListenerRegistered = false;

/**
 * When login() or register() explicitly calls supabase.auth.setSession(), it fires a
 * SIGNED_IN event. The listener's authApi.me() call would race against our just-set
 * session and can 401 on cold backends — triggering an immediate logout. We skip the
 * listener's authApi.me() for those explicit setSession() calls since we already have
 * the user from the login/register response.
 */
let skipNextSignedInFromExplicitSet = false;

/**
 * Cold start / flaky Wi‑Fi — bounded retries.
 * `staleSession`: JWT rejected by the API (e.g. Supabase project reset, user deleted) — clear local session.
 */
async function fetchMeWithRetry(maxAttempts = 5): Promise<{ user: User | null; staleSession: boolean }> {
  let last: User | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await authApi.me();
      const body = res?.data as { data?: User } | undefined;
      last = body?.data ?? null;
      if (last) return { user: last, staleSession: false };
    } catch (e) {
      last = null;
      if (axios.isAxiosError(e) && e.response?.status === 401) {
        return { user: null, staleSession: true };
      }
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  return { user: last, staleSession: false };
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
    let wipedOnLaunch = false;
    if (shouldNuclearWipeAuthOnLaunch()) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          '[Liveline] EXPO_PUBLIC_NUCLEAR_AUTH_WIPE_ON_LAUNCH is set — wiping local auth. Remove it from app/.env after this launch.',
        );
      }
      await nuclearWipeLocalAuthState();
      wipedOnLaunch = true;
    } else {
      wipedOnLaunch = await applyOneTimeClientAuthEpochWipe();
      if (wipedOnLaunch && __DEV__) {
        // eslint-disable-next-line no-console
        console.log('[Liveline] One-time client auth epoch wipe ran (see services/authWipe.ts).');
      }
    }
    if (wipedOnLaunch) {
      set({ user: null, session: null, isLoading: false });
    }

    if (!supabaseAuthListenerRegistered) {
      supabaseAuthListenerRegistered = true;
      supabase.auth.onAuthStateChange(async (event, session) => {
        set({ session });

        if (event === 'SIGNED_OUT') {
          clearAccessToken();
          const uid = get().user?.id;
          if (uid) void useNotificationStore.getState().clearCachedForUser(uid);
          useNotificationStore.getState().reset();
          useMusicStore.getState().resetMusicSession();
          useFeedStore.getState().reset();
          useMapStore.getState().resetMapSession();
          set({ user: null, session: null });
          return;
        }

        if (session?.access_token) setAccessToken(session.access_token);

        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          // Skip the /auth/me call when we explicitly called setSession() inside
          // login() or register() — we already have the user from those responses,
          // and a cold-backend 401 here would incorrectly log the user back out.
          if (event === 'SIGNED_IN' && skipNextSignedInFromExplicitSet) {
            skipNextSignedInFromExplicitSet = false;
            return;
          }
          try {
            const res = await authApi.me();
            const prev = get().user;
            const u = (res?.data as { data?: User } | undefined)?.data;
            set({ user: u ?? prev });
          } catch {
            // Don't logout here — backend 401 on TOKEN_REFRESHED can be a
            // transient cold-start failure, not a genuinely expired session.
            // Supabase fires SIGNED_OUT when the refresh token is actually dead.
          }
        }
      });
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) setAccessToken(session.access_token);
      if (session) {
        set({ session, user: get().user });

        void (async () => {
          try {
            await wakeBackend().catch(() => {});
            const { user, staleSession } = await fetchMeWithRetry(5);
            if (staleSession) {
              await get().logout();
            } else {
              set({ user: user ?? get().user });
            }
          } finally {
            set({ isInitialized: true });
          }
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

      // Flag the listener to skip its authApi.me() call — we already have the user
      // from the login response, and the listener's 401 handling can wrongly log out.
      skipNextSignedInFromExplicitSet = true;
      await withTimeout(
        supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
        20000,
        'Supabase session',
      );

      const user = resp?.data?.data?.user ?? resp?.data?.user ?? null;
      set({ user: user ?? null, session, isInitialized: true });
      void useFriendsInboxStore.getState().fetch({ silent: true });
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

      // Flag the listener to skip its authApi.me() call — we already have the user
      // from the register response, and the listener's 401 handling can wrongly log out.
      skipNextSignedInFromExplicitSet = true;
      await withTimeout(
        supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
        20000,
        'Supabase session',
      );

      const user = resp?.data?.data?.user ?? resp?.data?.user ?? null;
      set({ user: user ?? null, session, isInitialized: true });
      void useFriendsInboxStore.getState().fetch({ silent: true });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    const uid = get().user?.id;
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore: signOut can fail if the anon key is invalid
    }
    clearAccessToken();
    useFriendsInboxStore.getState().clear();
    useMusicStore.getState().resetMusicSession();
    if (uid) void useNotificationStore.getState().clearCachedForUser(uid);
    useNotificationStore.getState().reset();
    useFeedStore.getState().reset();
    useMapStore.getState().resetMapSession();
    set({ user: null, session: null });
  },

  setUser: (user) => set({ user }),

  refreshUser: async () => {
    try {
      const res = await authApi.me();
      const u = (res?.data as { data?: User } | undefined)?.data;
      if (u) set({ user: u });
    } catch {
      // Don't logout on a backend error — the Supabase session may still be
      // valid and the backend could be cold-starting. Supabase fires SIGNED_OUT
      // when the refresh token is genuinely gone; trust that event instead.
    }
  },
}));
