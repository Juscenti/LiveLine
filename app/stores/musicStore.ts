// ============================================================
// stores/musicStore.ts — Music activity state
// ============================================================
import { create } from 'zustand';
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
  startPolling: () => void;
  stopPolling: () => void;
  connectPlatform: (platform: MusicPlatform, token: string, oauthState?: string) => Promise<void>;
  disconnectPlatform: (platform: MusicPlatform) => Promise<void>;
  fetchTopTracks: (userId: string) => Promise<void>;
}

let syncTimer: ReturnType<typeof setInterval> | null = null;

export const useMusicStore = create<MusicState>((set) => ({
  nowPlaying: null,
  connectedPlatforms: [],
  topTracks: [],
  isSyncing: false,

  syncNowPlaying: async () => {
    set({ isSyncing: true });
    try {
      const { data } = await musicApi.syncNowPlaying();
      set({ nowPlaying: data.data });
    } catch {
      // No connected platform or not playing
    } finally {
      set({ isSyncing: false });
    }
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
      const { data } = await musicApi.getTopTracks(userId);
      set({ topTracks: data.data ?? [] });
    } catch {
      set({ topTracks: [] });
    }
  },
}));
