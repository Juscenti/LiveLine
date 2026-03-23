// ============================================================
// app/(tabs)/profile.tsx — Own profile (redesigned)
// ============================================================
import { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Dimensions, ActivityIndicator, Animated, Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useMusicStore } from '@/stores/musicStore';
import { postsApi } from '@/services/api';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import MusicBadge from '@/components/music/MusicBadge';
import PostThumb from '@/components/feed/PostThumb';
import type { Post } from '@/types';

const { width } = Dimensions.get('window');
const THUMB = (width - SPACING.base * 2 - 2) / 3; // 3-col grid, 1px gaps

// ── Stat pill ────────────────────────────────────────────────
function StatPill({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={statStyles.pill}>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  pill: { alignItems: 'center', flex: 1 },
  value: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});

// ── Animated banner with subtle parallax feel ────────────────
function ProfileHeader({
  user,
  posts,
  nowPlaying,
}: {
  user: any;
  posts: Post[];
  nowPlaying: any;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {/* Banner */}
      <View style={headerStyles.bannerContainer}>
        {user.banner_url ? (
          <Image source={{ uri: user.banner_url }} style={headerStyles.banner} resizeMode="cover" />
        ) : (
          <View style={headerStyles.bannerPlaceholder} />
        )}
        {/* subtle bottom fade so avatar floats cleanly */}
        <View style={headerStyles.bannerFade} />
      </View>

      {/* Avatar row */}
      <View style={headerStyles.avatarRow}>
        <View style={headerStyles.avatarRing}>
          {user.profile_picture_url ? (
            <Image source={{ uri: user.profile_picture_url }} style={headerStyles.avatar} />
          ) : (
            <View style={[headerStyles.avatar, headerStyles.avatarPlaceholder]}>
              <Text style={headerStyles.avatarInitial}>
                {(user.display_name ?? user.username ?? '?')[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
          )}
        </View>

        {/* Action buttons */}
        <View style={headerStyles.actions}>
          <Pressable
            style={({ pressed }) => [headerStyles.editBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/profile/edit')}
          >
            <Text style={headerStyles.editBtnText}>Edit profile</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [headerStyles.iconBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/settings')}
          >
            <Text style={headerStyles.iconBtnText}>⚙️</Text>
          </Pressable>
        </View>
      </View>

      {/* Identity */}
      <View style={headerStyles.identity}>
        <Text style={headerStyles.displayName} numberOfLines={1}>
          {user.display_name ?? user.username}
        </Text>
        <Text style={headerStyles.username}>@{user.username}</Text>
        {user.bio ? (
          <Text style={headerStyles.bio}>{user.bio}</Text>
        ) : null}
      </View>

      {/* Stats bar */}
      <View style={headerStyles.statsBar}>
        <StatPill value={posts.length} label="Posts" />
        <View style={headerStyles.statDivider} />
        <StatPill value={user.friends_count ?? '—'} label="Friends" />
        <View style={headerStyles.statDivider} />
        <StatPill value={user.likes_count ?? '—'} label="Likes" />
      </View>

      {/* Now playing */}
      {nowPlaying?.song && nowPlaying?.source ? (
        <View style={headerStyles.musicWrap}>
          <MusicBadge track={nowPlaying} />
        </View>
      ) : null}
    </Animated.View>
  );
}

const headerStyles = StyleSheet.create({
  bannerContainer: { height: 160, position: 'relative' },
  banner: { width: '100%', height: '100%' },
  bannerPlaceholder: {
    width: '100%', height: '100%',
    backgroundColor: COLORS.bgElevated,
  },
  bannerFade: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 48,
    // simulated gradient via layered transparency
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.base,
    marginTop: -44,
    zIndex: 10,
  },
  avatarRing: {
    borderWidth: 3,
    borderColor: COLORS.bg,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: {
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  actions: { flexDirection: 'row', gap: SPACING.sm, paddingBottom: 6 },
  editBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    backgroundColor: COLORS.bg,
  },
  editBtnText: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
  },
  iconBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: COLORS.bg,
  },
  iconBtnText: { fontSize: FONTS.sizes.base },
  identity: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.md,
    gap: 3,
  },
  displayName: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  username: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  bio: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textPrimary,
    marginTop: 6,
    lineHeight: 20,
    opacity: 0.85,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.base,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: COLORS.border,
  },
  musicWrap: {
    marginHorizontal: SPACING.base,
    marginTop: SPACING.md,
  },
});

// ── Quick-action row ─────────────────────────────────────────
function QuickActions() {
  return (
    <View style={qaStyles.row}>
      <Pressable
        style={({ pressed }) => [qaStyles.tile, pressed && qaStyles.tilePressed]}
        onPress={() => router.push('/friends')}
      >
        <Text style={qaStyles.tileIcon}>👥</Text>
        <Text style={qaStyles.tileLabel}>Friends</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [qaStyles.tile, pressed && qaStyles.tilePressed]}
        onPress={() => router.push('/music/connect')}
      >
        <Text style={qaStyles.tileIcon}>🎵</Text>
        <Text style={qaStyles.tileLabel}>Music</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [qaStyles.tile, pressed && qaStyles.tilePressed]}
        onPress={() => router.push('/interests')}
      >
        <Text style={qaStyles.tileIcon}>✨</Text>
        <Text style={qaStyles.tileLabel}>Interests</Text>
      </Pressable>
    </View>
  );
}

const qaStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginHorizontal: SPACING.base,
    marginTop: SPACING.md,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    gap: 4,
    backgroundColor: COLORS.bgElevated,
  },
  tilePressed: { opacity: 0.6 },
  tileIcon: { fontSize: 20 },
  tileLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: FONTS.weights.medium,
  },
});

// ── Post grid with section header ───────────────────────────
function PostsGrid({ posts }: { posts: Post[] }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 400, delay: 200, useNativeDriver: true,
    }).start();
  }, [posts.length]);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      {/* Section header */}
      <View style={gridStyles.sectionHeader}>
        <Text style={gridStyles.sectionTitle}>Posts</Text>
        {posts.length > 0 && (
          <Text style={gridStyles.sectionCount}>{posts.length}</Text>
        )}
      </View>

      {posts.length === 0 ? (
        <View style={gridStyles.empty}>
          <Text style={gridStyles.emptyIcon}>📷</Text>
          <Text style={gridStyles.emptyText}>No posts yet</Text>
          <Text style={gridStyles.emptySubtext}>Share your first moment</Text>
        </View>
      ) : (
        <View style={gridStyles.grid}>
          {posts.map((post) => (
            <Pressable
              key={post.id}
              style={({ pressed }) => [gridStyles.thumb, pressed && { opacity: 0.82 }]}
              onPress={() => router.push(`/post/${post.id}`)}
            >
              <PostThumb post={post} size={THUMB} onPress={() => router.push(`/post/${post.id}`)} />
            </Pressable>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const gridStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
  },
  sectionCount: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1.5,
    paddingHorizontal: SPACING.base,
  },
  thumb: { borderRadius: 2, overflow: 'hidden' },
  empty: {
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
    gap: SPACING.sm,
  },
  emptyIcon: { fontSize: 36, opacity: 0.4 },
  emptyText: {
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.medium,
    color: COLORS.textSecondary,
  },
  emptySubtext: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    opacity: 0.6,
  },
});

// ── Root screen ──────────────────────────────────────────────
export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const { nowPlaying } = useMusicStore();
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    postsApi
      .getUserPosts(user.id)
      .then(({ data }) => setPosts(Array.isArray(data?.data) ? data.data : []))
      .catch(() => setPosts([]));
  }, [user]);

  if (!user?.id) {
    return (
      <View style={rootStyles.loading}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={rootStyles.loadingText}>Loading profile…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={rootStyles.container}
      contentContainerStyle={rootStyles.content}
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
    >
      <ProfileHeader user={user} posts={posts} nowPlaying={nowPlaying} />
      <QuickActions />
      <PostsGrid posts={posts} />
      <View style={rootStyles.footer} />
    </ScrollView>
  );
}

const rootStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 0 },
  loading: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  footer: { height: SPACING.xl },
});