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
let lastNearbyRequestAt: number | null = null;
let lastNearbyRequestCoords: { latitude: number; longitude: number } | null = null;

const makeNearbySignature = (friends: MapFriend[]) =>
  friends
    .map((f) => `${f.user_id}:${f.latitude.toFixed(5)}:${f.longitude.toFixed(5)}:${f.activity_status ?? ''}`)
    .sort()
    .join('|');

// Haversine distance (meters) between two lat/lng points.
const distanceMeters = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371e3; // earth radius meters
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

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

    const now = Date.now();
    if (lastNearbyRequestAt && now - lastNearbyRequestAt < MAP.NEARBY_REFRESH_COOLDOWN_MS) return;
    if (lastNearbyRequestCoords) {
      const movedMeters = distanceMeters(loc, lastNearbyRequestCoords);
      if (movedMeters < MAP.NEARBY_REFRESH_DISTANCE_METERS) return;
    }

    lastNearbyRequestAt = now;
    lastNearbyRequestCoords = loc;
    set({ isRefreshing: true });
    try {
      const res = await mapApi.getNearbyFriends(loc.latitude, loc.longitude, MAP.DEFAULT_RADIUS_METERS);
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
