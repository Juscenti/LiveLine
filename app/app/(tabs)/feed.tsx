// ============================================================
// app/(tabs)/feed.tsx — Moment feed (Pinterest-style masonry)
// ============================================================
import { useEffect, useCallback, useMemo } from 'react';
import {
  View,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedStore } from '@/stores/feedStore';
import { COLORS, SPACING, FONTS, FEED } from '@/constants';
import PostCard from '@/components/feed/PostCard';
import type { FeedPost } from '@/types';

const { width: SCREEN_W } = Dimensions.get('window');

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { posts, isLoading, isRefreshing, loadFeed, loadMore, refresh } = useFeedStore();

  const { columnWidth, listPad } = useMemo(() => {
    const pad = SPACING.base;
    const g = FEED.gutter;
    const colW = (SCREEN_W - pad * 2 - 2 * g) / 2;
    return { columnWidth: colW, listPad: pad };
  }, []);

  useEffect(() => {
    loadFeed();
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedPost }) => (
      <View style={[styles.tileWrap, { width: columnWidth, marginHorizontal: FEED.gutter / 2 }]}>
        <PostCard
          post={item}
          width={columnWidth}
          onPress={() => router.push(`/post/${item.id}`)}
        />
      </View>
    ),
    [columnWidth],
  );

  const bottomPad = 100 + insets.bottom;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.wordmark}>liveline</Text>
        <TouchableOpacity
          style={styles.postBtn}
          onPress={() => router.push('/camera')}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={22} color={COLORS.textInverse} />
        </TouchableOpacity>
      </View>

      <FlashList
        style={styles.list}
        data={posts}
        masonry
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: listPad, paddingBottom: bottomPad },
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
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>⚡</Text>
              <Text style={styles.emptyTitle}>Nothing yet</Text>
              <Text style={styles.emptyText}>Add some friends or post your first moment.</Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FEED.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.sm,
    backgroundColor: FEED.background,
  },
  wordmark: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.black,
    color: COLORS.accent,
    letterSpacing: -1,
  },
  postBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: { flex: 1 },
  listContent: {
    paddingTop: 8,
  },
  tileWrap: {
    marginBottom: FEED.gutter,
  },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  emptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center' },
});
