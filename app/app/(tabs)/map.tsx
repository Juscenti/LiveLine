// ============================================================
// app/(tabs)/map.tsx — Live map
// ============================================================
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, Pressable, AppState } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, UrlTile } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { useMapStore } from '@/stores/mapStore';
import { COLORS, SPACING, FONTS, RADIUS, MAP } from '@/constants';
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
          showsUserLocation={false}
          onPress={() => {
            if (selectedFriendId) selectFriend(null);
          }}
        >
          <UrlTile
            zIndex={0}
            flipY={false}
            maximumZ={20}
            urlTemplate={MAPBOX_TILE_URL}
            shouldReplaceMapContent
          />
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

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Live Map</Text>
          <Text style={styles.count}>
            {nearbyFriends.length} nearby{isRefreshing ? ' • syncing...' : ''}
          </Text>
          {lastNearbyUpdatedAt ? (
            <Text style={styles.updatedAt}>Updated just now</Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={centerOnMe}>
          <Text style={styles.headerBtnText}>Center</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.headerBtn, { backgroundColor: COLORS.bgElevated }]} onPress={refreshNearby}>
          <Text style={styles.headerBtnText}>Refresh</Text>
        </TouchableOpacity>
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
  header: {
    position: 'absolute',
    top: 56,
    left: SPACING.base,
    right: SPACING.base,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard + 'E0',
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: { fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.bold, color: COLORS.textPrimary },
  count: { fontSize: FONTS.sizes.sm, color: COLORS.accent },
  updatedAt: { marginTop: 2, fontSize: FONTS.sizes.xs, color: COLORS.textTertiary },
  headerBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginLeft: 10,
  },
  headerBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.xs },
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

const MAPBOX_TILE_URL = MAP.MAPBOX_DARK_TILE_TEMPLATE.replace(
  '{token}',
  encodeURIComponent(MAP.MAPBOX_PUBLIC_TOKEN),
);
