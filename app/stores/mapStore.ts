// ============================================================
// stores/mapStore.ts — Live map state
// ============================================================
import { create } from 'zustand';
import * as Location from 'expo-location';
import { mapApi } from '@/services/api';
import { MAP } from '@/constants';
import type { MapFriend } from '@/types';

interface MapState {
  myLocation: { latitude: number; longitude: number } | null;
  nearbyFriends: MapFriend[];
  selectedFriendId: string | null;
  isTracking: boolean;
  isRefreshing: boolean;
  lastNearbyUpdatedAt: number | null;
  locationPermission: 'granted' | 'denied' | 'undetermined';
  watchSubscription: Location.LocationSubscription | null;

  requestPermission: () => Promise<boolean>;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  refreshNearby: () => Promise<void>;
  selectFriend: (userId: string | null) => void;
  setVisibility: (visibility: string) => Promise<void>;
}

let updateTimer: ReturnType<typeof setInterval> | null = null;
let nearbyPollTimer: ReturnType<typeof setInterval> | null = null;
let lastNearbySignature = '';

const makeNearbySignature = (friends: MapFriend[]) =>
  friends
    .map((f) => `${f.user_id}:${f.latitude.toFixed(5)}:${f.longitude.toFixed(5)}:${f.activity_status ?? ''}`)
    .sort()
    .join('|');

export const useMapStore = create<MapState>((set, get) => ({
  myLocation: null,
  nearbyFriends: [],
  selectedFriendId: null,
  isTracking: false,
  isRefreshing: false,
  lastNearbyUpdatedAt: null,
  locationPermission: 'undetermined',
  watchSubscription: null,

  requestPermission: async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    set({ locationPermission: status as any });
    return status === 'granted';
  },

  startTracking: async () => {
    const granted = await get().requestPermission();
    if (!granted) return;

    let pos: Location.LocationObject;
    try {
      pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {
      // Simulator / disabled location services / timeout — avoid uncaught promise rejection.
      set({ isTracking: false, myLocation: null });
      return;
    }

    const { latitude, longitude } = pos.coords;
    set({ myLocation: { latitude, longitude }, isTracking: true });

    const push = async () => {
      const loc = get().myLocation;
      if (!loc) return;
      try {
        await mapApi.updateLocation({ latitude: loc.latitude, longitude: loc.longitude });
      } catch {
        // Network / server — non-fatal for map UX
      }
    };

    await push();
    await get().refreshNearby();
    if (updateTimer) clearInterval(updateTimer);
    updateTimer = setInterval(push, MAP.UPDATE_INTERVAL_MS);
    if (nearbyPollTimer) clearInterval(nearbyPollTimer);
    nearbyPollTimer = setInterval(() => {
      void get().refreshNearby();
    }, MAP.NEARBY_POLL_INTERVAL_MS);

    try {
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (p) => {
          set({ myLocation: { latitude: p.coords.latitude, longitude: p.coords.longitude } });
          // Movement is a strong signal map context changed; sync and refetch nearby.
          void push();
          void get().refreshNearby();
        }
      );
      set({ watchSubscription: sub });
    } catch {
      set({ isTracking: false });
    }
  },

  stopTracking: () => {
    const { watchSubscription } = get();
    watchSubscription?.remove();
    if (updateTimer) clearInterval(updateTimer);
    if (nearbyPollTimer) clearInterval(nearbyPollTimer);
    set({ isTracking: false, watchSubscription: null, isRefreshing: false });
  },

  refreshNearby: async () => {
    const loc = get().myLocation;
    if (!loc) return;
    if (get().isRefreshing) return;
    set({ isRefreshing: true });
    try {
      const res = await mapApi.getNearbyFriends(loc.latitude, loc.longitude);
      const body = res?.data as { data?: MapFriend[] } | undefined;
      const rows = body?.data;
      const nextRows = Array.isArray(rows) ? rows : [];
      const nextSignature = makeNearbySignature(nextRows);
      const currentSelected = get().selectedFriendId;
      const selectedStillExists = !currentSelected || nextRows.some((f) => f.user_id === currentSelected);

      // Only commit nearby list updates when the payload actually changed.
      if (nextSignature !== lastNearbySignature || !selectedStillExists) {
        lastNearbySignature = nextSignature;
        set({
          nearbyFriends: nextRows,
          selectedFriendId: selectedStillExists ? currentSelected : null,
          lastNearbyUpdatedAt: Date.now(),
        });
      }
    } catch {
      // Preserve previous friend markers if refresh fails to avoid a flashing/empty map.
    } finally {
      set({ isRefreshing: false });
    }
  },

  selectFriend: (userId) => set({ selectedFriendId: userId }),

  setVisibility: async (visibility) => {
    try {
      await mapApi.setVisibility(visibility);
    } catch {
      throw new Error('Could not update map visibility.');
    }
  },
}));
