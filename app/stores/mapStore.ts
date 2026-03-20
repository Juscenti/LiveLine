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

export const useMapStore = create<MapState>((set, get) => ({
  myLocation: null,
  nearbyFriends: [],
  selectedFriendId: null,
  isTracking: false,
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

    // Initial position
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = pos.coords;
    set({ myLocation: { latitude, longitude }, isTracking: true });

    // Throttled server push
    const push = async () => {
      const loc = get().myLocation;
      if (!loc) return;
      await mapApi.updateLocation({ latitude: loc.latitude, longitude: loc.longitude });
      await get().refreshNearby();
    };

    await push();
    if (updateTimer) clearInterval(updateTimer);
    updateTimer = setInterval(push, MAP.UPDATE_INTERVAL_MS);

    // Watch device location
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
      (pos) => {
        set({ myLocation: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } });
      }
    );
    set({ watchSubscription: sub });
  },

  stopTracking: () => {
    const { watchSubscription } = get();
    watchSubscription?.remove();
    if (updateTimer) clearInterval(updateTimer);
    set({ isTracking: false, watchSubscription: null });
  },

  refreshNearby: async () => {
    const loc = get().myLocation;
    if (!loc) return;
    const { data } = await mapApi.getNearbyFriends(loc.latitude, loc.longitude);
    set({ nearbyFriends: data.data });
  },

  selectFriend: (userId) => set({ selectedFriendId: userId }),

  setVisibility: async (visibility) => {
    await mapApi.setVisibility(visibility);
  },
}));
