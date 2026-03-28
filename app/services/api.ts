// ============================================================
// services/api.ts — Axios instance pointing to Node.js backend
// ============================================================
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { Session } from '@supabase/supabase-js';
import { rewriteLocalhostForAndroidEmulator } from '@/utils/devNetwork';
import { supabase } from './supabase';
import { getAccessToken, setAccessToken } from './accessTokenStore';

type RetryableRequest = InternalAxiosRequestConfig & { _retryAfterAuth?: boolean };

const BASE_URL = rewriteLocalhostForAndroidEmulator(process.env.EXPO_PUBLIC_API_URL ?? '');
if (!BASE_URL) {
  throw new Error('Missing env: EXPO_PUBLIC_API_URL');
}

export const api = axios.create({
  baseURL: BASE_URL,
  // Hosted backends (e.g. Railway) may cold-start; keep a generous timeout.
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

const getBackendHealthUrl = () => {
  // BASE_URL is like ".../api". Backend health route is at "/health".
  const base = BASE_URL.replace(/\/api\/?$/, '');
  return `${base}/health`;
};

// Wake the backend (cold start / slow first byte) before authenticated calls.
export const wakeBackend = async () => {
  try {
    await axios.get(getBackendHealthUrl(), { timeout: 45_000 });
  } catch {
    // Ignore; we'll still try the normal API flow afterwards.
  }
};

/** Web / async storage can lag right after login — bounded retries avoid 401 on first paint. */
async function getSessionForApi(): Promise<Session | null> {
  const read = async (): Promise<Session | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? session : null;
  };
  for (let i = 0; i < 4; i++) {
    const s = await read();
    if (s) return s;
    await new Promise((r) => setTimeout(r, 80 * (i + 1)));
  }
  return null;
}

async function applyFreshTokenToRequest(config: RetryableRequest): Promise<boolean> {
  const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
  let token = refreshData.session?.access_token;
  if (!token && !refreshErr) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token;
  }
  if (token) {
    setAccessToken(token);
    config.headers.Authorization = `Bearer ${token}`;
    return true;
  }
  return false;
}

// Attach Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  // Avoid auth-session lookups for unauthenticated endpoints.
  const url = config.url ?? '';
  const isAuthFree =
    url.includes('/auth/register') ||
    url.includes('/auth/login');

  if (isAuthFree) return config;

  try {
    // Prefer the live Supabase session (auto-refreshed). In-memory token alone can be
    // stale after refresh and caused 401s on posts/delete/friends while the UI still looked logged in.
    const session = await getSessionForApi();
    if (session?.access_token) {
      setAccessToken(session.access_token);
      config.headers.Authorization = `Bearer ${session.access_token}`;
      return config;
    }
    const token = getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {
    const token = getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// One retry after refresh: fixes races right after login / cold start where the first requests
// ran before AsyncStorage session was readable, without signing the user out.
api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const status = err.response?.status;
    const original = err.config as RetryableRequest | undefined;
    const url = original?.url ?? '';

    const isAuthFree =
      url.includes('/auth/register') ||
      url.includes('/auth/login');

    if (status !== 401 || !original || isAuthFree) {
      return Promise.reject(err);
    }

    // Refresh did not help, or we already retried — local session is invalid (e.g. Supabase reset).
    if (original._retryAfterAuth) {
      void import('@/stores/authStore').then(({ useAuthStore }) => {
        void useAuthStore.getState().logout();
      });
      return Promise.reject(err);
    }

    original._retryAfterAuth = true;
    const ok = await applyFreshTokenToRequest(original);
    if (!ok) {
      void import('@/stores/authStore').then(({ useAuthStore }) => {
        void useAuthStore.getState().logout();
      });
      return Promise.reject(err);
    }
    return api(original);
  },
);

// ── Typed request helpers ───────────────────────────────────

export const authApi = {
  register: (data: { email: string; password: string; username: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

export const usersApi = {
  getProfile: (userId: string) => api.get(`/users/${userId}`),
  updateProfile: (data: Partial<{ display_name: string; bio: string; username: string }>) =>
    api.patch('/users/me', data),
  uploadAvatar: (formData: FormData) =>
    api.post('/users/me/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadBanner: (formData: FormData) =>
    api.post('/users/me/banner', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateInterests: (interestIds: number[]) =>
    api.put('/users/me/interests', { interest_ids: interestIds }),
  search: (query: string, page = 0) =>
    api.get('/users/search', { params: { q: query, offset: page * 20 } }),
};

export const postsApi = {
  getFeed: (cursor?: string) =>
    api.get('/posts/feed', { params: { cursor } }),
  getPost: (postId: string) =>
    api.get(`/posts/${postId}`),
  create: (formData: FormData) =>
    api.post('/posts', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (postId: string) => api.delete(`/posts/${postId}`),
  like: (postId: string) => api.post(`/posts/${postId}/like`),
  unlike: (postId: string) => api.delete(`/posts/${postId}/like`),
  recordView: (postId: string) => api.post(`/posts/${postId}/view`),
  getComments: (postId: string) => api.get(`/posts/${postId}/comments`),
  addComment: (postId: string, body: string) =>
    api.post(`/posts/${postId}/comments`, { body }),
  deleteComment: (postId: string, commentId: string) =>
    api.delete(`/posts/${postId}/comments/${commentId}`),
  getUserPosts: (userId: string, cursor?: string) =>
    api.get(`/users/${userId}/posts`, { params: { cursor } }),
};

export const friendsApi = {
  getList: () => api.get('/friends'),
  getRequests: () => api.get('/friends/requests'),
  getOutgoing: () => api.get('/friends/outgoing'),
  getStatus: (userId: string) => api.get(`/friends/status/${userId}`),
  sendRequest: (userId: string) => api.post(`/friends/request/${userId}`),
  acceptRequest: (friendshipId: string) => api.patch(`/friends/${friendshipId}/accept`),
  declineRequest: (friendshipId: string) => api.patch(`/friends/${friendshipId}/decline`),
  remove: (userId: string) => api.delete(`/friends/${userId}`),
  block: (userId: string) => api.post(`/friends/block/${userId}`),
};

export const mapApi = {
  updateLocation: (data: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    activity_status?: string;
    visibility?: string;
  }) => api.post('/map/location', data),
  getNearbyFriends: (lat: number, lng: number, radius?: number) =>
    api.get('/map/nearby', { params: { lat, lng, radius } }),
  setVisibility: (visibility: string) =>
    api.patch('/map/visibility', { visibility }),
};

export const musicApi = {
  connectSpotify: (code: string, state: string, redirectUri?: string) =>
    api.post('/music/connect/spotify', { code, state, redirectUri }),
  connectAppleMusic: (token: string) => api.post('/music/connect/apple', { token }),
  connectSoundCloud: (code: string) => api.post('/music/connect/soundcloud', { code }),
  getConnectedPlatforms: () => api.get('/music/connect/platforms'),
  getSpotifyAuthUrl: (redirectUri?: string) =>
    api.get('/music/connect/spotify/auth-url', { params: { redirectUri } }),
  getAppleMusicAuthUrl: () => api.get('/music/connect/apple/auth-url'),
  disconnect: (platform: string) => api.delete(`/music/connect/${platform}`),
  getNowPlaying: (userId: string) => api.get(`/music/${userId}/now-playing`),
  getTopTracks: (userId: string) => api.get(`/music/${userId}/top-tracks`),
  syncNowPlaying: () => api.post('/music/sync'),
};

export const notificationsApi = {
  getAll: (cursor?: string) =>
    api.get('/notifications', { params: { cursor } }),
  markRead: (notificationId: string) =>
    api.patch(`/notifications/${notificationId}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  registerPushToken: (token: string, platform: string) =>
    api.post('/notifications/push-token', { token, platform }),
};

export const interestsApi = {
  getAll: () => api.get('/interests'),
};
