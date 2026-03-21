// ============================================================
// services/api.ts — Axios instance pointing to Node.js backend
// ============================================================
import axios from 'axios';
import { rewriteLocalhostForAndroidEmulator } from '@/utils/devNetwork';
import { supabase } from './supabase';
import { getAccessToken, setAccessToken } from './accessTokenStore';

const BASE_URL = rewriteLocalhostForAndroidEmulator(process.env.EXPO_PUBLIC_API_URL ?? '');
if (!BASE_URL) {
  throw new Error('Missing env: EXPO_PUBLIC_API_URL');
}

export const api = axios.create({
  baseURL: BASE_URL,
  // Render can go to sleep; cold starts may exceed the old 15s timeout.
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

const getBackendHealthUrl = () => {
  // BASE_URL is like ".../api". Backend health route is at "/health".
  const base = BASE_URL.replace(/\/api\/?$/, '');
  return `${base}/health`;
};

// Wake the backend (Render cold start) before we make authenticated calls.
export const wakeBackend = async () => {
  try {
    await axios.get(getBackendHealthUrl(), { timeout: 45_000 });
  } catch {
    // Ignore; we'll still try the normal API flow afterwards.
  }
};

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
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      setAccessToken(session.access_token);
      config.headers.Authorization = `Bearer ${session.access_token}`;
      // #region agent log
      fetch('http://127.0.0.1:7393/ingest/3b33b110-61a6-45ae-9299-a69f0711fe19', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd26f09' },
        body: JSON.stringify({
          sessionId: 'd26f09',
          hypothesisId: 'H4',
          location: 'services/api.ts:interceptor',
          message: 'axios auth attach',
          data: {
            url: config.url,
            source: 'supabase_session',
            tokenLen: session.access_token.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return config;
    }
    const token = getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    // #region agent log
    fetch('http://127.0.0.1:7393/ingest/3b33b110-61a6-45ae-9299-a69f0711fe19', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd26f09' },
      body: JSON.stringify({
        sessionId: 'd26f09',
        hypothesisId: 'H4',
        location: 'services/api.ts:interceptor',
        message: 'axios auth attach',
        data: {
          url: config.url,
          source: 'memory_fallback',
          tokenLen: token?.length ?? 0,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  } catch {
    const token = getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    // #region agent log
    fetch('http://127.0.0.1:7393/ingest/3b33b110-61a6-45ae-9299-a69f0711fe19', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd26f09' },
      body: JSON.stringify({
        sessionId: 'd26f09',
        hypothesisId: 'H4',
        location: 'services/api.ts:interceptor',
        message: 'axios auth attach catch',
        data: { url: config.url, tokenLen: token?.length ?? 0 },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  return config;
});

// Do not sign out on every 401 — posts/friends/map can return 401 for reasons other than "bad session",
// and cold backends / RLS / race conditions were nuking the Supabase session and bricking the app.
api.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err)
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
  connectSpotify: (code: string, state: string) =>
    api.post('/music/connect/spotify', { code, state }),
  connectAppleMusic: (token: string) => api.post('/music/connect/apple', { token }),
  connectSoundCloud: (code: string) => api.post('/music/connect/soundcloud', { code }),
  getSpotifyAuthUrl: () => api.get('/music/connect/spotify/auth-url'),
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
