// ============================================================
// stores/musicStore.ts — Music activity state
// ============================================================
import { create } from 'zustand';
import axios from 'axios';
import { musicApi } from '@/services/api';
import { MUSIC } from '@/constants';
import type { MusicTrack, MusicPlatform } from '@/types';
import * as Linking from 'expo-linking';

interface MusicState {
  nowPlaying: MusicTrack | null;
  connectedPlatforms: MusicPlatform[];
  topTracks: MusicTrack[];
  isSyncing: boolean;

  syncNowPlaying: () => Promise<void>;
  hydrateConnectedPlatforms: () => Promise<void>;
  resetMusicSession: () => void;
  startPolling: () => void;
  stopPolling: () => void;
  connectPlatform: (platform: MusicPlatform, token: string, oauthState?: string) => Promise<void>;
  disconnectPlatform: (platform: MusicPlatform) => Promise<void>;
  fetchTopTracks: (userId: string) => Promise<void>;
}

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncInFlight: Promise<void> | null = null;
let syncBackoffUntil = 0;

export const useMusicStore = create<MusicState>((set) => ({
  nowPlaying: null,
  connectedPlatforms: [],
  topTracks: [],
  isSyncing: false,

  syncNowPlaying: async () => {
    if (Date.now() < syncBackoffUntil) return;
    if (syncInFlight) return syncInFlight;

    const run = async () => {
      set({ isSyncing: true });
      try {
        const res = await musicApi.syncNowPlaying();
        const body = res.data as { data?: MusicTrack | null };
        set({ nowPlaying: body?.data ?? null });
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 429) {
          const ra = e.response.headers?.['retry-after'];
          const sec = Number(Array.isArray(ra) ? ra[0] : ra);
          const ms =
            Number.isFinite(sec) && sec > 0 ? Math.min(sec * 1000, 120_000) : 60_000;
          syncBackoffUntil = Date.now() + ms;
          if (__DEV__ && process.env.EXPO_PUBLIC_VERBOSE_NETWORK_LOGS === 'true') {
            // eslint-disable-next-line no-console
            console.warn('[syncNowPlaying] rate limited; backing off', Math.round(ms / 1000), 's');
          }
          return;
        }
        console.error('[syncNowPlaying] failed:', e);
      } finally {
        set({ isSyncing: false });
      }
    };

    syncInFlight = run().finally(() => {
      syncInFlight = null;
    });
    return syncInFlight;
  },

  hydrateConnectedPlatforms: async () => {
    try {
      const res = await musicApi.getConnectedPlatforms();
      const body = res.data as { data?: { platforms?: MusicPlatform[] } };
      const list = body?.data?.platforms;
      if (Array.isArray(list)) {
        set({ connectedPlatforms: [...new Set(list)] as MusicPlatform[] });
      }
    } catch {
      /* keep existing */
    }
  },

  resetMusicSession: () => {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
    syncBackoffUntil = 0;
    set({ nowPlaying: null, connectedPlatforms: [], topTracks: [], isSyncing: false });
  },

  startPolling: () => {
    if (syncTimer) return;
    syncTimer = setInterval(() => {
      useMusicStore.getState().syncNowPlaying();
    }, MUSIC.SYNC_INTERVAL_MS);
  },

  stopPolling: () => {
    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  },

  connectPlatform: async (platform, token, oauthState) => {
    if (platform === 'spotify') {
      if (!oauthState) throw new Error('Missing OAuth state. Open Connect from the app after requesting the Spotify link.');
      const redirectUri = Linking.createURL('/music/callback/spotify');
      await musicApi.connectSpotify(token, oauthState, redirectUri);
    }
    if (platform === 'apple_music') await musicApi.connectAppleMusic(token);
    if (platform === 'soundcloud')  await musicApi.connectSoundCloud(token);
    set((s) => ({
      connectedPlatforms: [...new Set([...s.connectedPlatforms, platform])],
    }));
  },

  disconnectPlatform: async (platform) => {
    try {
      await musicApi.disconnect(platform);
      set((s) => ({
        connectedPlatforms: s.connectedPlatforms.filter((p) => p !== platform),
        nowPlaying: s.nowPlaying?.source === platform ? null : s.nowPlaying,
      }));
    } catch {
      throw new Error('Could not disconnect. Try again.');
    }
  },

  fetchTopTracks: async (userId) => {
    try {
      const res = await musicApi.getTopTracks(userId);
      const body = res.data as { data?: MusicTrack[] };
      const list = body?.data ?? (Array.isArray(res.data) ? (res.data as MusicTrack[]) : []);
      set({ topTracks: Array.isArray(list) ? list : [] });
    } catch {
      set({ topTracks: [] });
    }
  },
}));
