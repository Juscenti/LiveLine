// ============================================================
// app/(tabs)/_layout.tsx — Bottom tab navigator
// ============================================================
import { Tabs } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '@/constants';
import { useNotificationStore } from '@/stores/notificationStore';

const IONICON_NAMES = {
  feed: 'home',
  friends: 'people',
  map: 'map',
  notifications: 'notifications',
  profile: 'person',
} as const;

// Tab bar icon component
function TabIcon({ icon, focused }: { icon: keyof typeof IONICON_NAMES; focused: boolean }) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.92)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1 : 0.92,
      speed: 18,
      bounciness: 8,
      useNativeDriver: false,
    }).start();
  }, [focused, scale]);

  const color = focused ? COLORS.accent : COLORS.textTertiary;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={IONICON_NAMES[icon]} size={24} color={color} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.textTertiary,
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="feed"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="feed" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="map" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="friends" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            tabBarIcon: ({ focused }) => (
              <View>
                <TabIcon icon="notifications" focused={focused} />
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="profile" focused={focused} />,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.bgCard,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    height: 92,
    paddingBottom: 18,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: COLORS.error,
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: FONTS.weights.bold },
});
