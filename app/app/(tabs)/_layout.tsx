// ============================================================
// app/(tabs)/_layout.tsx — Floating pill tab bar (ref: centered dock,
// sliding active capsule). Uses RN Animated (no Reanimated) to avoid
// Worklets native/JS version mismatches on dev clients.
// ============================================================
import { Tabs } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Platform,
  Pressable,
  LayoutChangeEvent,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '@/constants';
import { useNotificationStore } from '@/stores/notificationStore';
import { useAuthStore } from '@/stores/authStore';
import { useFriendsInboxStore } from '@/stores/friendsInboxStore';
import { useMusicStore } from '@/stores/musicStore';

/** Reference proportions: bar ≈ 2.5× icon height; icon ≈ 40% of bar. */
const ICON_SIZE = 23;
const BAR_HEIGHT = Math.round(ICON_SIZE * 2.5);
const TAB_SIDE_MARGIN = 32;
const TAB_BOTTOM_GAP = 14;
const TRACK_PAD_H = 10;
const HIGHLIGHT_V_INSET = 5;
/** Share of each tab slot used by the sliding highlight (wider = more “pill” behind icon). */
const HIGHLIGHT_SLOT_RATIO = 0.86;
const HIGHLIGHT_MIN_W = 48;
const HIGHLIGHT_SLOT_GAP = 3;

/** Middle-ground motion: ~280–320ms feel — not snappy, not sluggish. */
const SPRING_HIGHLIGHT = { friction: 9, tension: 74, useNativeDriver: true as const };
const SPRING_ICON = { friction: 8, tension: 105, useNativeDriver: true as const };
const SPRING_PRESS = { friction: 6, tension: 280, useNativeDriver: true as const };

const IONICON_NAMES = {
  feed: { outline: 'home-outline' as const, solid: 'home' as const },
  friends: { outline: 'chatbubbles-outline' as const, solid: 'chatbubbles' as const },
  map: { outline: 'map-outline' as const, solid: 'map' as const },
  notifications: { outline: 'notifications-outline' as const, solid: 'notifications' as const },
} as const;

type IonTabKey = keyof typeof IONICON_NAMES;

function IonTabGlyph({ tab, focused }: { tab: IonTabKey; focused: boolean }) {
  const names = IONICON_NAMES[tab];
  return (
    <Ionicons
      name={focused ? names.solid : names.outline}
      size={ICON_SIZE}
      color={COLORS.tabBarIcon}
    />
  );
}

function ProfileGlyph({ focused }: { focused: boolean }) {
  const user = useAuthStore((s) => s.user);
  const uri = user?.profile_picture_url;
  if (uri) {
    return <Image source={{ uri }} style={styles.profileAvatar} />;
  }
  return (
    <Ionicons
      name={focused ? 'person' : 'person-outline'}
      size={ICON_SIZE}
      color={COLORS.tabBarIcon}
    />
  );
}

function TabIconSlot({
  focused,
  onPress,
  children,
}: {
  focused: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const focusScale = useRef(new Animated.Value(focused ? 1.05 : 1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const scale = useRef(Animated.multiply(focusScale, pressScale)).current;

  useEffect(() => {
    Animated.spring(focusScale, {
      toValue: focused ? 1.05 : 1,
      ...SPRING_ICON,
    }).start();
  }, [focused, focusScale]);

  const onPressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.94,
      ...SPRING_PRESS,
    }).start();
  };
  const onPressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      ...SPRING_PRESS,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={styles.slotPress}
    >
      <Animated.View style={[styles.slotInner, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const [trackW, setTrackW] = useState(0);
  const [highlightW, setHighlightW] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  const routes = state.routes;
  const n = routes.length;

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackW(e.nativeEvent.layout.width);
  }, []);

  useEffect(() => {
    if (trackW <= 0 || n <= 0) return;
    const contentW = trackW - 2 * TRACK_PAD_H;
    const slot = contentW / n;
    const hw = Math.min(
      Math.max(slot * HIGHLIGHT_SLOT_RATIO, HIGHLIGHT_MIN_W),
      slot - HIGHLIGHT_SLOT_GAP,
    );
    setHighlightW(hw);
    // `styles.highlight` uses `left: TRACK_PAD_H` so x is measured from the content row (same as flex slots).
    const x = state.index * slot + (slot - hw) / 2;
    Animated.spring(translateX, {
      toValue: x,
      ...SPRING_HIGHLIGHT,
    }).start();
  }, [state.index, trackW, n, translateX]);

  const bottomPad = TAB_BOTTOM_GAP + insets.bottom;

  return (
    <View
      style={[styles.tabBarRoot, { paddingBottom: bottomPad }]}
      pointerEvents="box-none"
    >
      <View style={[styles.dockOuter, { height: BAR_HEIGHT }]}>
        <View style={styles.track} onLayout={onTrackLayout}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.highlight,
              {
                width: highlightW,
                transform: [{ translateX }],
              },
            ]}
          />
          {routes.map((route, index) => {
            const focused = state.index === index;
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name as never);
              }
            };

            const name = route.name as string;

            return (
              <View key={route.key} style={styles.slot}>
                {name === 'notifications' ? (
                  <View style={styles.notifWrap}>
                    <TabIconSlot focused={focused} onPress={onPress}>
                      <IonTabGlyph tab="notifications" focused={focused} />
                    </TabIconSlot>
                    {unreadCount > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <TabIconSlot focused={focused} onPress={onPress}>
                    {name === 'feed' && <IonTabGlyph tab="feed" focused={focused} />}
                    {name === 'map' && <IonTabGlyph tab="map" focused={focused} />}
                    {name === 'friends' && <IonTabGlyph tab="friends" focused={focused} />}
                    {name === 'profile' && <ProfileGlyph focused={focused} />}
                  </TabIconSlot>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function FriendsInboxPrefetch() {
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!session?.access_token) {
      useFriendsInboxStore.getState().clear();
      return;
    }
    void useFriendsInboxStore.getState().fetch({ silent: true });
  }, [session?.access_token]);

  return null;
}

function MusicLifecyclePrefetch() {
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!session?.access_token) {
      useMusicStore.getState().resetMusicSession();
      return;
    }
    void (async () => {
      await useMusicStore.getState().hydrateConnectedPlatforms();
      await useMusicStore.getState().syncNowPlaying();
      useMusicStore.getState().startPolling();
    })();
  }, [session?.access_token]);

  return null;
}

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <FriendsInboxPrefetch />
      <MusicLifecyclePrefetch />
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,
          lazy: false,
        }}
      >
        <Tabs.Screen name="feed" options={{ tabBarIcon: () => null }} />
        <Tabs.Screen name="map" options={{ tabBarIcon: () => null }} />
        <Tabs.Screen name="friends" options={{ tabBarIcon: () => null }} />
        <Tabs.Screen name="notifications" options={{ tabBarIcon: () => null }} />
        <Tabs.Screen name="profile" options={{ tabBarIcon: () => null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarRoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: TAB_SIDE_MARGIN,
  },
  dockOuter: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: COLORS.tabBarPill,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.4)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.32,
        shadowRadius: 16,
      },
      android: {
        elevation: 14,
      },
      default: {},
    }),
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TRACK_PAD_H,
    position: 'relative',
  },
  highlight: {
    position: 'absolute',
    left: TRACK_PAD_H,
    top: HIGHLIGHT_V_INSET,
    height: BAR_HEIGHT - HIGHLIGHT_V_INSET * 2,
    borderRadius: 999,
    backgroundColor: COLORS.tabBarPillActive,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotPress: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotInner: {
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_HEIGHT - 4,
  },
  profileAvatar: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
  },
  notifWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    left: '50%',
    marginLeft: 6,
    backgroundColor: COLORS.error,
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    zIndex: 4,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: FONTS.weights.bold },
});
