// ============================================================
// app/(tabs)/notifications.tsx
// ============================================================
import { useEffect, useCallback } from 'react';
import {
  View, FlatList, Text, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotificationStore } from '@/stores/notificationStore';
import { COLORS, SPACING, FONTS } from '@/constants';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { Notification } from '@/types';

dayjs.extend(relativeTime);

const ICONS: Record<string, string> = {
  friend_request: '👋',
  friend_accepted: '🤝',
  post_like: '❤️',
  post_comment: '💬',
  post_mention: '📣',
  new_post_from_friend: '⚡',
  music_match: '🎵',
  system: '📢',
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { notifications, isLoading, load, loadMore, markRead, markAllRead } = useNotificationStore();

  useEffect(() => { load(); }, []);

  const renderItem = useCallback(({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.item, !item.is_read && styles.itemUnread]}
      onPress={() => {
        if (!item.is_read) markRead(item.id);
        // Navigate to relevant content
        if (item.ref_type === 'post' && item.ref_id) router.push(`/post/${item.ref_id}`);
        if (item.ref_type === 'friendship') router.push('/(tabs)/friends');
      }}
    >
      <Text style={styles.icon}>{ICONS[item.type] ?? '🔔'}</Text>
      <View style={styles.body}>
        <Text style={styles.content}>{item.content}</Text>
        <Text style={styles.time}>{dayjs(item.created_at).fromNow()}</Text>
      </View>
      {!item.is_read && <View style={styles.dot} />}
    </TouchableOpacity>
  ), [markRead]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={markAllRead}>
          <Text style={styles.markAll}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={COLORS.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🔔</Text>
            <Text style={styles.emptyText}>No notifications yet</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.base, paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.bold, color: COLORS.textPrimary },
  markAll: { fontSize: FONTS.sizes.sm, color: COLORS.accent },
  list: { paddingBottom: 100 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.base, borderBottomWidth: 1, borderBottomColor: COLORS.borderSubtle,
  },
  itemUnread: { backgroundColor: COLORS.accentMuted },
  icon: { fontSize: 24 },
  body: { flex: 1 },
  content: { fontSize: FONTS.sizes.sm, color: COLORS.textPrimary, lineHeight: 20 },
  time: { fontSize: FONTS.sizes.xs, color: COLORS.textTertiary, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 40, marginBottom: SPACING.md },
  emptyText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.base },
});
