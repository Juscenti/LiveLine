// ============================================================
// app/(tabs)/map.tsx — Live map
// ============================================================
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, Pressable, AppState } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { useMapStore } from '@/stores/mapStore';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import FriendMapMarker from '@/components/map/FriendMapMarker';
import FriendMapSheet from '@/components/map/FriendMapSheet';
import type { MapFriend } from '@/types';

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const {
    myLocation, nearbyFriends, selectedFriendId,
    startTracking, stopTracking,
    selectFriend, locationPermission,
    refreshNearby, isRefreshing, lastNearbyUpdatedAt,
  } = useMapStore();
  const hasCenteredInitiallyRef = useRef(false);
  useEffect(() => {
    startTracking();
    return () => stopTracking();
    // Zustand store actions are stable references.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  const region = useMemo(() => {
    if (!myLocation) return null;
    return {
      latitude: myLocation.latitude,
      longitude: myLocation.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [myLocation]);

  useEffect(() => {
    // Set camera once when location is first available; don't force recenter
    // on every gps tick so users can explore the map smoothly.
    if (region && mapRef.current && !hasCenteredInitiallyRef.current) {
      hasCenteredInitiallyRef.current = true;
      mapRef.current.animateToRegion(region, 600);
    }
  }, [region]);

  useFocusEffect(
    useCallback(() => {
      // Refresh immediately when the user navigates to map tab.
      void refreshNearby();
      return undefined;
    }, [refreshNearby]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Foreground return can include friend/location changes while app was backgrounded.
        void refreshNearby();
      }
    });
    return () => sub.remove();
  }, [refreshNearby]);

  const centerOnMe = () => {
    if (!region || !mapRef.current) return;
    mapRef.current.animateToRegion(region, 600);
    selectFriend(null);
  };

  const openFriendOnMap = (friend: MapFriend) => {
    const next = {
      latitude: friend.latitude,
      longitude: friend.longitude,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    };
    mapRef.current?.animateToRegion(next as any, 600);
  };

  const selectedFriend = nearbyFriends.find((f) => f.user_id === selectedFriendId) ?? null;

  return (
    <View style={styles.container}>
      {region ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={region as any}
          minZoomLevel={4}
          maxZoomLevel={17}
          showsUserLocation={false}
          onPress={() => {
            if (selectedFriendId) selectFriend(null);
          }}
          customMapStyle={darkMapStyle}
        >
          {/* Self marker */}
          {myLocation && (
            <Marker coordinate={myLocation} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.selfMarker}>
                <View style={styles.selfDot} />
              </View>
            </Marker>
          )}

          {/* Friend markers */}
          {nearbyFriends.map((friend) => (
            <Marker
              key={friend.user_id}
              coordinate={{ latitude: friend.latitude, longitude: friend.longitude }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
              zIndex={friend.user_id === selectedFriendId ? 1000 : 1}
              onPress={() => {
                selectFriend(friend.user_id);
                openFriendOnMap(friend);
              }}
            >
              <FriendMapMarker friend={friend} selected={friend.user_id === selectedFriendId} />
            </Marker>
          ))}
        </MapView>
      ) : (
        <View style={styles.loadingMap}>
          <Text style={styles.loadingMapTitle}>Getting your location…</Text>
        </View>
      )}

      {/* Dim map + dismiss when a friend card is open */}
      {selectedFriend && (
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => selectFriend(null)}
          accessibilityRole="button"
          accessibilityLabel="Close friend preview"
        />
      )}

      {/* Floating top controls */}
      <View style={styles.topControls}>
        <View style={styles.infoCard}>
          <Text style={styles.title}>Live Map</Text>
          <Text style={styles.count}>{nearbyFriends.length} nearby</Text>
          <Text style={styles.updatedAt}>
            {isRefreshing
              ? 'Syncing...'
              : lastNearbyUpdatedAt
                ? 'Updated just now'
                : 'Waiting for nearby updates'}
          </Text>
        </View>

        <View style={styles.actionStack}>
          <TouchableOpacity style={styles.centerBtn} onPress={centerOnMe} activeOpacity={0.9}>
            <Text style={styles.centerBtnText}>Center</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshBtn} onPress={refreshNearby} activeOpacity={0.9}>
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Permission prompt */}
      {locationPermission === 'denied' && (
        <View style={styles.permBanner}>
          <Text style={styles.permText}>Location access is required for the live map.</Text>
        </View>
      )}

      {/* Selected friend sheet */}
      {selectedFriend && (
        <FriendMapSheet
          friend={selectedFriend}
          onClose={() => selectFriend(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  map: { ...StyleSheet.absoluteFillObject },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
    zIndex: 8,
  },
  topControls: {
    position: 'absolute',
    top: 56,
    left: SPACING.base,
    right: SPACING.base,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  infoCard: {
    flex: 1,
    backgroundColor: 'rgba(18,18,18,0.86)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 10,
  },
  actionStack: {
    width: 108,
    gap: SPACING.sm,
  },
  centerBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  refreshBtn: {
    backgroundColor: 'rgba(20,20,20,0.88)',
    borderRadius: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: { fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.bold, color: COLORS.textPrimary },
  count: { fontSize: FONTS.sizes.sm, color: COLORS.accent },
  updatedAt: { marginTop: 2, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  centerBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  refreshBtnText: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.sm },
  selfMarker: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.accent + '30',
    justifyContent: 'center', alignItems: 'center',
  },
  selfDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },
  permBanner: {
    position: 'absolute', bottom: 100, left: SPACING.base, right: SPACING.base,
    backgroundColor: COLORS.error + 'CC', padding: SPACING.md, borderRadius: RADIUS.md,
  },
  permText: { color: '#fff', textAlign: 'center', fontSize: FONTS.sizes.sm },
  loadingMap: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  loadingMapTitle: { color: COLORS.textSecondary, fontWeight: FONTS.weights.semibold },
});

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0f0f0f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#555555' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c1c1c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#141414' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050505' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
