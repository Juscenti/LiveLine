// ============================================================
// stores/prefsStore.ts — Client-side preferences (AsyncStorage)
// ============================================================
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type VideoAutoplay = 'always' | 'wifi' | 'never';

export interface Prefs {
  haptics: boolean;
  reduceMotion: boolean;
  videoAutoplay: VideoAutoplay;
  dataSaver: boolean;
  liveMapEnabled: boolean;
}

const STORAGE_KEY = 'liveline.prefs.v1';

const DEFAULT_PREFS: Prefs = {
  haptics: true,
  reduceMotion: false,
  videoAutoplay: 'always',
  dataSaver: false,
  liveMapEnabled: true,
};

interface PrefsState extends Prefs {
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setHaptics: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
  setVideoAutoplay: (v: VideoAutoplay) => void;
  setDataSaver: (v: boolean) => void;
  setLiveMapEnabled: (v: boolean) => void;
}

let hydrateInFlight: Promise<void> | null = null;

async function persist(next: Prefs) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // non-fatal
  }
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  ...DEFAULT_PREFS,
  isHydrated: false,

  hydrate: async () => {
    if (get().isHydrated) return;
    if (hydrateInFlight) return hydrateInFlight;
    hydrateInFlight = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Prefs>;
          set({
            haptics: typeof parsed.haptics === 'boolean' ? parsed.haptics : DEFAULT_PREFS.haptics,
            reduceMotion: typeof parsed.reduceMotion === 'boolean' ? parsed.reduceMotion : DEFAULT_PREFS.reduceMotion,
            videoAutoplay:
              parsed.videoAutoplay === 'always' || parsed.videoAutoplay === 'wifi' || parsed.videoAutoplay === 'never'
                ? parsed.videoAutoplay
                : DEFAULT_PREFS.videoAutoplay,
            dataSaver: typeof parsed.dataSaver === 'boolean' ? parsed.dataSaver : DEFAULT_PREFS.dataSaver,
            liveMapEnabled: typeof parsed.liveMapEnabled === 'boolean' ? parsed.liveMapEnabled : DEFAULT_PREFS.liveMapEnabled,
          });
        }
      } catch {
        // keep defaults
      } finally {
        set({ isHydrated: true });
        hydrateInFlight = null;
      }
    })();
    return hydrateInFlight;
  },

  setHaptics: (v) => {
    set({ haptics: v });
    void persist({ ...prefsSnapshot(get()), haptics: v });
  },
  setReduceMotion: (v) => {
    set({ reduceMotion: v });
    void persist({ ...prefsSnapshot(get()), reduceMotion: v });
  },
  setVideoAutoplay: (v) => {
    set({ videoAutoplay: v });
    void persist({ ...prefsSnapshot(get()), videoAutoplay: v });
  },
  setDataSaver: (v) => {
    set({ dataSaver: v });
    void persist({ ...prefsSnapshot(get()), dataSaver: v });
  },
  setLiveMapEnabled: (v) => {
    set({ liveMapEnabled: v });
    void persist({ ...prefsSnapshot(get()), liveMapEnabled: v });
  },
}));

function prefsSnapshot(s: PrefsState): Prefs {
  return {
    haptics: s.haptics,
    reduceMotion: s.reduceMotion,
    videoAutoplay: s.videoAutoplay,
    dataSaver: s.dataSaver,
    liveMapEnabled: s.liveMapEnabled,
  };
}
