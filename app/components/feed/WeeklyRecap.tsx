// ============================================================
// components/feed/WeeklyRecap.tsx
// Weekly spotlight — only rendered on Saturdays.
// Shows all friends' posts from the current Sun–Sat week in a
// horizontal scrollable strip.
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import { postsApi } from '@/services/api';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';
import type { Post } from '@/types';

const TILE_W = 108;
const TILE_H = Math.round(TILE_W * (5 / 4)); // portrait 4:5

function RecapTile({ post }: { post: Post }) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      style={styles.tile}
      onPress={() => router.push(`/post/${post.id}`)}
    >
      {post.thumbnail_url || post.media_type === 'image' ? (
        <Image
          source={{ uri: post.thumbnail_url ?? post.media_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={styles.tilePlaceholder}>
          <Text style={styles.tilePlaceholderIcon}>▶</Text>
        </View>
      )}
      {post.media_type === 'video' && (
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>▶</Text>
        </View>
      )}
      {/* Author avatar chip */}
      {post.author?.profile_picture_url ? (
        <Image
          source={{ uri: post.author.profile_picture_url }}
          style={styles.authorAvatar}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.authorAvatar, styles.authorAvatarFallback]}>
          <Text style={styles.authorAvatarInitial}>
            {(post.author?.display_name ?? post.author?.username ?? '?')[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function WeeklyRecap() {
  // Only show on Saturday (dayjs day index 6)
  const isSaturday = dayjs().day() === 6;

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await postsApi.getWeeklyRecap();
      setPosts(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSaturday) void load();
  }, [isSaturday, load]);

  if (!isSaturday) return null;
  if (!loading && posts.length === 0) return null;

  // Date range label: "Sun May 11 – Sat May 17"
  const saturday = dayjs();
  const sunday = saturday.subtract(6, 'day');
  const rangeLabel = `${sunday.format('MMM D')} – ${saturday.format('MMM D')}`;

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Week in Review</Text>
          <Text style={styles.headerRange}>{rangeLabel}</Text>
        </View>
        <View style={styles.sparkBadge}>
          <Text style={styles.sparkText}>⚡</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={COLORS.accent} size="small" />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {posts.map((post) => (
            <RecapTile key={post.id} post={post} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerLeft: { gap: 2 },
  headerTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  headerRange: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    letterSpacing: 0.2,
  },
  sparkBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: `${COLORS.accent}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkText: { fontSize: 18 },
  loadingRow: {
    height: TILE_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strip: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.bgElevated,
  },
  tilePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgElevated,
  },
  tilePlaceholderIcon: { fontSize: 24, color: COLORS.textTertiary },
  videoBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 99,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  videoBadgeText: { color: '#fff', fontSize: 8, fontWeight: FONTS.weights.bold },
  authorAvatar: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.bg,
  },
  authorAvatarFallback: {
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorAvatarInitial: {
    fontSize: 10,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
});
