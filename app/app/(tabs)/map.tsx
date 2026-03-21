// ============================================================
// app/(tabs)/map.tsx — Live map
// ============================================================
import { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useMapStore } from '@/stores/mapStore';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, MAP, SPACING, FONTS, RADIUS } from '@/constants';
import FriendMapMarker from '@/components/map/FriendMapMarker';
import FriendMapSheet from '@/components/map/FriendMapSheet';
import type { MapFriend } from '@/types';

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const {
    myLocation, nearbyFriends, selectedFriendId,
    isTracking, startTracking, stopTracking,
    selectFriend, locationPermission,
    refreshNearby,
  } = useMapStore();
  const { user } = useAuthStore();

  useEffect(() => {
    startTracking();
    return () => stopTracking();
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
    // If the region is uncontrolled (initialRegion), it can keep using defaults.
    // Animate to the real device location once we have it.
    if (region && mapRef.current) {
      mapRef.current.animateToRegion(region, 600);
    }
  }, [region]);

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
          region={region as any}
          showsUserLocation={false}
          customMapStyle={darkMapStyle}
          onPress={() => selectFriend(null)}
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

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Live Map</Text>
          <Text style={styles.count}>{nearbyFriends.length} nearby</Text>
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
  header: {
    position: 'absolute',
    top: 56,
    left: SPACING.base,
    right: SPACING.base,
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

// Mapbox dark style equivalent for react-native-maps
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
