// ============================================================
// app/(tabs)/notifications.tsx — Activity / notifications
// ============================================================
import { useEffect, useCallback, useMemo, useState, memo } from 'react';
import {
  View,
  SectionList,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { COLORS, SPACING, FONTS, RADIUS, TAB_BAR } from '@/constants';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { Notification, NotificationType } from '@/types';

dayjs.extend(relativeTime);

type IonName = keyof typeof Ionicons.glyphMap;

const TYPE_META: Record<
  NotificationType,
  { icon: IonName; bubble: string; iconColor: string }
> = {
  friend_request: { icon: 'person-add', bubble: 'rgba(68,136,255,0.22)', iconColor: '#6BA3FF' },
  friend_accepted: { icon: 'checkmark-circle', bubble: 'rgba(0,255,148,0.18)', iconColor: COLORS.accent },
  post_like: { icon: 'heart', bubble: 'rgba(255,80,120,0.2)', iconColor: '#FF6B8A' },
  post_comment: { icon: 'chatbubble-ellipses', bubble: 'rgba(255,255,255,0.1)', iconColor: COLORS.textPrimary },
  post_mention: { icon: 'at', bubble: 'rgba(255,184,0,0.18)', iconColor: COLORS.warning },
  new_post_from_friend: { icon: 'flash', bubble: 'rgba(0,255,148,0.14)', iconColor: COLORS.accent },
  music_match: { icon: 'musical-notes', bubble: 'rgba(29,185,84,0.22)', iconColor: COLORS.spotify },
  system: { icon: 'megaphone', bubble: 'rgba(136,136,255,0.2)', iconColor: '#A8A8FF' },
};

function sectionTitleForKey(dayKey: string): string {
  const d = dayjs(dayKey);
  if (d.isSame(dayjs(), 'day')) return 'Today';
  if (d.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Yesterday';
  if (d.isAfter(dayjs().subtract(6, 'day'), 'day')) return d.format('dddd');
  return d.format('MMM D, YYYY');
}

interface NotifSection {
  title: string;
  data: Notification[];
}

function buildSections(items: Notification[]): NotifSection[] {
  const map = new Map<string, Notification[]>();
  for (const n of items) {
    const key = dayjs(n.created_at).format('YYYY-MM-DD');
    const arr = map.get(key) ?? [];
    arr.push(n);
    map.set(key, arr);
  }
  const keys = [...map.keys()].sort((a, b) => (a > b ? -1 : 1));
  return keys.map((dayKey) => ({
    title: sectionTitleForKey(dayKey),
    data: (map.get(dayKey) ?? []).sort(
      (a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf(),
    ),
  }));
}

const NotificationRow = memo(function NotificationRow({
  item,
  onPress,
}: {
  item: Notification;
  onPress: (n: Notification) => void;
}) {
  const meta = TYPE_META[item.type] ?? TYPE_META.system;
  const actorUri = item.actor?.profile_picture_url;

  return (
    <TouchableOpacity
      style={[styles.card, !item.is_read && styles.cardUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.88}
    >
      <View style={styles.cardInner}>
        <View style={styles.avatarCluster}>
          <View style={[styles.iconBubble, { backgroundColor: meta.bubble }]}>
            <Ionicons name={meta.icon} size={22} color={meta.iconColor} />
          </View>
          {actorUri ? <Image source={{ uri: actorUri }} style={styles.actorAvatar} /> : null}
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardText, !item.is_read && styles.cardTextUnread]} numberOfLines={3}>
            {item.content}
          </Text>
          <Text style={styles.cardTime}>{dayjs(item.created_at).fromNow()}</Text>
        </View>
        {!item.is_read ? <View style={styles.unreadPip} /> : null}
      </View>
    </TouchableOpacity>
  );
});

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);
  const [refreshing, setRefreshing] = useState(false);
  const {
    notifications,
    isLoading,
    unreadCount,
    hasMore,
    load,
    loadMore,
    markRead,
    markAllRead,
    hydrateFromCache,
  } = useNotificationStore();

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      await hydrateFromCache(userId);
      await load(userId);
    })();
  }, [userId, hydrateFromCache, load]);

  const onRefresh = useCallback(() => {
    if (!userId) return;
    setRefreshing(true);
    void load(userId).finally(() => setRefreshing(false));
  }, [load, userId]);

  const sections = useMemo(() => buildSections(notifications), [notifications]);

  const onItemPress = useCallback(
    (item: Notification) => {
      if (!item.is_read) void markRead(item.id);
      if (item.ref_type === 'post' && item.ref_id) router.push(`/post/${item.ref_id}`);
      if (item.ref_type === 'friendship') router.push('/(tabs)/friends');
    },
    [markRead],
  );

  const bottomPad = TAB_BAR.height + TAB_BAR.bottomGap + insets.bottom + SPACING.lg;

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => <NotificationRow item={item} onPress={onItemPress} />,
    [onItemPress],
  );

  const renderSectionHeader = useCallback(({ section }: { section: NotifSection }) => (
    <Text style={styles.sectionLabel}>{section.title}</Text>
  ), []);

  const statusLine =
    unreadCount > 0
      ? `${unreadCount} unread ${unreadCount === 1 ? 'update' : 'updates'}`
      : "You're all caught up";

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topBarRow}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 ? (
            <TouchableOpacity style={styles.clearPill} onPress={() => void markAllRead()} activeOpacity={0.85}>
              <Ionicons name="checkmark-done" size={18} color={COLORS.textInverse} />
              <Text style={styles.clearPillText}>Mark all read</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.headerSubtitle}>{statusLine}</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyWrap}>
              <LinearGradient
                colors={['rgba(0,255,148,0.08)', 'rgba(0,0,0,0)']}
                style={styles.emptyGradient}
              />
              <View style={styles.emptyRing}>
                <Ionicons name="notifications" size={40} color={COLORS.accent} />
              </View>
              <Text style={styles.emptyTitle}>Quiet for now</Text>
              <Text style={styles.emptyBody}>
                Likes, comments, friend activity, and music matches show up here when they happen.
              </Text>
            </View>
          ) : (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.accent} />
            </View>
          )
        }
        ListFooterComponent={
          isLoading && notifications.length > 0 && hasMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={COLORS.accent} />
            </View>
          ) : null
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        SectionSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  topBar: {
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    marginTop: SPACING.xs,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.medium,
  },
  clearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  clearPillText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textInverse,
  },
  listContent: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.md,
    flexGrow: 1,
  },
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  card: {
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  cardUnread: {
    borderColor: 'rgba(0,255,148,0.35)',
    backgroundColor: 'rgba(0,255,148,0.06)',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  avatarCluster: {
    width: 44,
    height: 44,
    position: 'relative',
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actorAvatar: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.bgCard,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardText: {
    fontSize: FONTS.sizes.base,
    color: COLORS.textSecondary,
    lineHeight: 22,
    fontWeight: FONTS.weights.regular,
  },
  cardTextUnread: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.medium,
  },
  cardTime: {
    marginTop: SPACING.xs,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
    fontWeight: FONTS.weights.medium,
  },
  unreadPip: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginTop: 4,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xxxl,
    paddingBottom: SPACING.xxl,
    position: 'relative',
  },
  emptyGradient: {
    position: 'absolute',
    left: SPACING.base,
    right: SPACING.base,
    top: SPACING.lg,
    height: 160,
    borderRadius: RADIUS.xl,
  },
  emptyRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(0,255,148,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,255,148,0.08)',
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  emptyBody: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  loadingBox: { paddingTop: SPACING.xxxl * 2, alignItems: 'center' },
  footerLoader: { paddingVertical: SPACING.lg, alignItems: 'center' },
});
