// ============================================================
// app/(tabs)/feed.tsx — Moment feed (Pinterest-style grid)
// ============================================================
import { useEffect, useCallback } from 'react';
import {
  View, FlatList, RefreshControl, StyleSheet,
  Text, TouchableOpacity, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useFeedStore } from '@/stores/feedStore';
import { COLORS, SPACING, FONTS } from '@/constants';
import PostCard from '@/components/feed/PostCard';
import type { FeedPost } from '@/types';

const { width } = Dimensions.get('window');
const COL = 2;
const CARD_WIDTH = (width - SPACING.base * 3) / COL;

export default function FeedScreen() {
  const { posts, isLoading, isRefreshing, loadFeed, loadMore, refresh } = useFeedStore();

  useEffect(() => { loadFeed(); }, []);

  const renderItem = useCallback(({ item }: { item: FeedPost }) => (
    <PostCard post={item} width={CARD_WIDTH} onPress={() => router.push(`/post/${item.id}`)} />
  ), []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>liveline</Text>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={COL}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
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
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingTop: 56,
    paddingBottom: SPACING.sm,
  },
  wordmark: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.black, color: COLORS.accent, letterSpacing: -1 },
  list: { padding: SPACING.base, gap: SPACING.sm },
  row: { gap: SPACING.sm, marginBottom: SPACING.sm },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  emptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center' },
});
