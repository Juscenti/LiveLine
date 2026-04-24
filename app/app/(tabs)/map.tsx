// ============================================================
// app/(tabs)/map.tsx — Live map
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, Pressable, AppState, Animated } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMapStore } from '@/stores/mapStore';
import { COLORS, SPACING, FONTS, RADIUS, TAB_BAR } from '@/constants';
import FriendMapMarker from '@/components/map/FriendMapMarker';
import FriendMapSheet from '@/components/map/FriendMapSheet';
import type { MapFriend } from '@/types';

const RING_SIZE = 24;

function SelfMapMarker() {
  const scale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, { toValue: 2.6, duration: 1600, useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale, ringOpacity]);

  return (
    <View style={selfStyles.container}>
      <Animated.View style={[selfStyles.ring, { transform: [{ scale }], opacity: ringOpacity }]} />
      <View style={selfStyles.dot} />
    </View>
  );
}

function AnimatedFriendPin({
  friend,
  selected,
  onPress,
}: {
  friend: MapFriend;
  selected: boolean;
  onPress: () => void;
}) {
  const [animationDone, setAnimationDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimationDone(true), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <Marker
      coordinate={{ latitude: friend.latitude, longitude: friend.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={!animationDone || selected}
      zIndex={selected ? 1000 : 1}
      onPress={onPress}
    >
      <FriendMapMarker friend={friend} selected={selected} />
    </Marker>
  );
}

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const {
    myLocation, nearbyFriends, selectedFriendId,
    startTracking, stopTracking,
    selectFriend, locationPermission,
    refreshNearby,
  } = useMapStore();
  const hasCenteredInitiallyRef = useRef(false);
  useEffect(() => {
    startTracking();
    return () => stopTracking();
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
          {/* Self marker — tracksViewChanges must stay true for the pulse animation to render */}
          {myLocation && (
            <Marker coordinate={myLocation} anchor={{ x: 0.5, y: 0.5 }}>
              <SelfMapMarker />
            </Marker>
          )}

          {/* Friend markers */}
          {nearbyFriends.map((friend) => (
            <AnimatedFriendPin
              key={friend.user_id}
              friend={friend}
              selected={friend.user_id === selectedFriendId}
              onPress={() => {
                selectFriend(friend.user_id);
                openFriendOnMap(friend);
              }}
            />
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

      {/* Top-right map controls (icons only; nearby list updates quietly in the store). */}
      <View style={[styles.topControls, { top: insets.top + 12 }]}>
        <View style={styles.actionStack}>
          <TouchableOpacity
            style={styles.centerBtn}
            onPress={centerOnMe}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Center map on my location"
          >
            <Ionicons name="locate" size={22} color={COLORS.textInverse} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => void refreshNearby({ force: true })}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Refresh nearby friends"
          >
            <Ionicons name="refresh" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Below floating tab bar — does not change tab bar position */}
      <View
        style={[styles.nearbyFooter, { height: TAB_BAR.bottomGap + insets.bottom }]}
        pointerEvents="none"
      >
        <Text style={styles.nearbyCount}>{nearbyFriends.length} nearby</Text>
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
    left: SPACING.base,
    right: SPACING.base,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  actionStack: {
    width: 48,
    gap: SPACING.sm,
  },
  centerBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    width: 48,
    height: 48,
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
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  nearbyFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 12,
  },
  nearbyCount: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.accent },
  permBanner: {
    position: 'absolute', bottom: 100, left: SPACING.base, right: SPACING.base,
    backgroundColor: COLORS.error + 'CC', padding: SPACING.md, borderRadius: RADIUS.md,
  },
  permText: { color: '#fff', textAlign: 'center', fontSize: FONTS.sizes.sm },
  loadingMap: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  loadingMapTitle: { color: COLORS.textSecondary, fontWeight: FONTS.weights.semibold },
});

const selfStyles = StyleSheet.create({
  container: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: COLORS.accent + '40',
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },
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
