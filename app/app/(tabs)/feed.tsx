// ============================================================
// app/(tabs)/feed.tsx — Moment feed (Pinterest-style masonry)
// ============================================================
import { useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedStore } from '@/stores/feedStore';
import { COLORS, SPACING, FONTS, FEED } from '@/constants';
import PostCard from '@/components/feed/PostCard';
import type { FeedPost } from '@/types';
import { useResponsive } from '@/utils/responsive';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const [feedWidth, setFeedWidth] = useState(0);
  const { posts, isLoading, isRefreshing, loadFeed, loadMore, refresh } = useFeedStore();
  const showEmpty = !isLoading && posts.length === 0;

  /**
   * Full-bleed masonry: no side padding; tight gutter between columns only.
   * Use measured width (not `useWindowDimensions` alone) so column math matches the
   * actual list — avoids a 1px+ sliver on the right from float/rounding drift.
   */
  const { columnWidth, gutter, innerWidth } = useMemo(() => {
    const inner = Math.round(feedWidth > 0 ? feedWidth : r.width);
    const g = Math.max(6, Math.round(inner * 0.014));
    const colW = (inner - 2 * g) / 2;
    return { columnWidth: colW, gutter: g, innerWidth: inner };
  }, [feedWidth, r.width]);

  useEffect(() => {
    loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedPost }) => (
      <View style={{ width: columnWidth, marginHorizontal: gutter / 2, marginBottom: gutter }}>
        <PostCard
          post={item}
          width={columnWidth}
          onPress={() => router.push(`/post/${item.id}`)}
        />
      </View>
    ),
    [columnWidth, gutter],
  );

  const bottomPad = 100 + insets.bottom;

  const feedScale = Math.min(r.scale * 1.08, 1.45);
  const postBtnSize = Math.round(44 * feedScale);
  const headerPad = Math.max(10, r.width * 0.03);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingHorizontal: headerPad }]}>
        <Text style={[styles.wordmark, { fontSize: FONTS.sizes.xl * feedScale }]}>liveline</Text>
        <TouchableOpacity
          style={[
            styles.postBtn,
            {
              width: postBtnSize,
              height: postBtnSize,
              borderRadius: postBtnSize / 2,
            },
          ]}
          onPress={() => router.push('/camera')}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={Math.round(22 * feedScale)} color={COLORS.textInverse} />
        </TouchableOpacity>
      </View>

      <View
        style={styles.feedColumn}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          setFeedWidth((prev) => (prev === w ? prev : w));
        }}
      >
        <FlashList
          style={styles.list}
          data={posts}
          masonry
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPad, width: innerWidth },
          ]}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={COLORS.accent}
            />
          }
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.empty}>
                <ActivityIndicator color={COLORS.accent} size="large" />
              </View>
            ) : showEmpty ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>⚡</Text>
                <Text style={[styles.emptyTitle, { fontSize: FONTS.sizes.lg * feedScale }]}>
                  Nothing yet
                </Text>
                <Text style={[styles.emptyText, { fontSize: FONTS.sizes.sm * feedScale }]}>
                  Add some friends or post your first moment.
                </Text>
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FEED.background },
  feedColumn: {
    flex: 1,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: SPACING.sm,
    backgroundColor: FEED.background,
  },
  wordmark: {
    fontWeight: FONTS.weights.black,
    color: COLORS.accent,
    letterSpacing: -1,
  },
  postBtn: {
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: { flex: 1, width: '100%' },
  listContent: {
    paddingTop: 8,
  },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: {
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  emptyText: { color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: SPACING.lg },
});
