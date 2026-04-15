// ============================================================
// app/(tabs)/profile.tsx — Own profile (redesigned)
// ============================================================
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  Image, ActivityIndicator, Animated, Pressable, useWindowDimensions, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/authStore';
import { useMusicStore } from '@/stores/musicStore';
import { useFriendsInboxStore } from '@/stores/friendsInboxStore';
import { postsApi } from '@/services/api';
import { COLORS, SPACING, FONTS, RADIUS, TAB_BAR, FEED } from '@/constants';
import PostThumb from '@/components/feed/PostThumb';
import type { Post } from '@/types';

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
  spotifyConnected,
  friendsCount,
  totalLikes,
}: {
  user: any;
  posts: Post[];
  nowPlaying: any;
  spotifyConnected: boolean;
  friendsCount: number;
  totalLikes: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
    ]).start();
  }, []);

  const isPlaying = !!(nowPlaying?.is_currently_playing);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {/* Banner — rounded bottom + gradient into page background */}
      <View style={headerStyles.bannerContainer}>
        {user.banner_url ? (
          <Image source={{ uri: user.banner_url }} style={headerStyles.banner} resizeMode="cover" />
        ) : (
          <View style={headerStyles.bannerPlaceholder} />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.35)', COLORS.bg]}
          locations={[0.35, 0.78, 1]}
          style={headerStyles.bannerGradient}
        />
      </View>

      {/* Avatar overlaps banner */}
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
      </View>

      {/* Name + bio */}
      <View style={headerStyles.identity}>
        <Text style={headerStyles.displayName} numberOfLines={1}>
          {user.display_name ?? user.username}
        </Text>
        <Text style={headerStyles.username}>@{user.username}</Text>
        {user.bio ? (
          <Text style={headerStyles.bio}>{user.bio}</Text>
        ) : null}
      </View>

      {/* Stats bar — sits between bio and action buttons */}
      <View style={headerStyles.statsBar}>
        <StatPill value={posts.length} label="Posts" />
        <View style={headerStyles.statDivider} />
        <Pressable
          style={({ pressed }) => [headerStyles.statPressable, pressed && { opacity: 0.75 }]}
          onPress={() => router.push('/(tabs)/friends')}
          accessibilityRole="button"
          accessibilityLabel="Open friends"
        >
          <StatPill value={friendsCount} label="Friends" />
        </Pressable>
        <View style={headerStyles.statDivider} />
        <StatPill value={totalLikes} label="Likes" />
      </View>

      {/* Action buttons — Edit profile + icon buttons */}
      <View style={headerStyles.actions}>
        <Pressable
          style={({ pressed }) => [headerStyles.editBtn, pressed && { opacity: 0.75 }]}
          onPress={() => router.push('/profile/edit')}
        >
          <Text style={headerStyles.editBtnText}>Edit profile</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [headerStyles.iconBtn, pressed && { opacity: 0.75 }]}
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={20} color={COLORS.textPrimary} />
        </Pressable>
        {/* Spotify — compact icon button; green when connected, dot when actively playing */}
        <Pressable
          style={({ pressed }) => [
            headerStyles.iconBtn,
            spotifyConnected && headerStyles.iconBtnSpotify,
            pressed && { opacity: 0.75 },
          ]}
          onPress={() => router.push('/music/connect')}
          accessibilityRole="button"
          accessibilityLabel={spotifyConnected ? 'Spotify connected' : 'Connect Spotify'}
        >
          <Ionicons
            name="musical-note"
            size={20}
            color={spotifyConnected ? '#1DB954' : COLORS.textSecondary}
          />
          {isPlaying && <View style={headerStyles.playingDot} />}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const headerStyles = StyleSheet.create({
  bannerContainer: {
    height: 200,
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    marginHorizontal: SPACING.xs,
  },
  banner: { width: '100%', height: '100%' },
  bannerPlaceholder: {
    width: '100%', height: '100%',
    backgroundColor: COLORS.bgElevated,
  },
  bannerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
  },
  avatarRow: {
    paddingHorizontal: SPACING.base,
    marginTop: -42,
    zIndex: 10,
  },
  avatarRing: {
    width: 94,
    height: 94,
    borderWidth: 3,
    borderColor: COLORS.bg,
    borderRadius: 47,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
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
  identity: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.sm,
    gap: 4,
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
    marginTop: SPACING.sm,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: COLORS.border,
  },
  statPressable: { flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginHorizontal: SPACING.base,
    alignItems: 'center',
  },
  editBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 9,
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
  },
  editBtnText: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
  },
  iconBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: RADIUS.full,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgElevated,
  },
  iconBtnSpotify: {
    borderColor: 'rgba(29,185,84,0.35)',
    backgroundColor: 'rgba(29,185,84,0.08)',
  },
  playingDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1DB954',
  },
});

// ── Quick-action row ─────────────────────────────────────────
function QuickActions() {
  return (
    <View style={qaStyles.row}>
      <Pressable
        style={({ pressed }) => [qaStyles.tile, pressed && qaStyles.tilePressed]}
        onPress={() => router.push('/(tabs)/friends')}
      >
        <Ionicons name="people" size={22} color="#6BA3FF" />
        <Text style={qaStyles.tileLabel}>Friends</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [qaStyles.tile, pressed && qaStyles.tilePressed]}
        onPress={() => router.push('/music/connect')}
      >
        <Ionicons name="musical-notes" size={22} color={COLORS.textSecondary} />
        <Text style={qaStyles.tileLabel}>Music</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [qaStyles.tile, pressed && qaStyles.tilePressed]}
        onPress={() => router.push('/interests')}
      >
        <Ionicons name="sparkles" size={22} color={COLORS.warning} />
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
    marginTop: SPACING.sm,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
    backgroundColor: COLORS.bgElevated,
  },
  tilePressed: { opacity: 0.6 },
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
  const { width: winW } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const cols = 3;
  const gutter = 6;
  const padH = SPACING.base * 2;
  const layoutW = winW > 0 ? winW : Dimensions.get('window').width;
  const thumbW = Math.max(1, (layoutW - padH - gutter * (cols - 1)) / cols);

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
        <View style={[gridStyles.grid, { gap: gutter }]}>
          {posts.map((post) => (
            <PostThumb
              key={post.id}
              post={post}
              size={thumbW}
              aspectRatio={FEED.fallbackAspect}
              onPress={() => router.push(`/post/${post.id}`)}
            />
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
    paddingHorizontal: SPACING.base,
  },
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
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const friendsCount = useFriendsInboxStore((s) => s.friends.length);
  const { nowPlaying, connectedPlatforms } = useMusicStore();
  const spotifyConnected = useMemo(() => connectedPlatforms.includes('spotify'), [connectedPlatforms]);
  const [posts, setPosts] = useState<Post[]>([]);

  const totalLikes = useMemo(
    () => posts.reduce((sum, p) => sum + (typeof p.like_count === 'number' ? p.like_count : 0), 0),
    [posts],
  );

  useEffect(() => {
    if (!user?.id) return;
    postsApi
      .getUserPosts(user.id)
      .then(({ data }) => setPosts(Array.isArray(data?.data) ? data.data : []))
      .catch(() => setPosts([]));
  }, [user?.id]);

  // Warm up profile-related data as soon as the tabs layout mounts (so switching tabs
  // doesn't wait on network round-trips). UI will still show loaders if user is not ready.
  useEffect(() => {
    if (!user?.id) return;
    void refreshUser();
    void useFriendsInboxStore.getState().fetch({ withSpinner: false, silent: true });
  }, [user?.id, refreshUser]);

  useFocusEffect(
    useCallback(() => {
      void refreshUser();
      void useFriendsInboxStore.getState().fetch({ withSpinner: false, silent: true });
      // Music poll runs from tabs layout (MUSIC.SYNC_INTERVAL_MS); avoid extra /music/sync on every tab focus.
    }, [refreshUser]),
  );

  const bottomPad = TAB_BAR.height + TAB_BAR.bottomGap + insets.bottom + SPACING.lg;

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
      contentContainerStyle={[rootStyles.content, { paddingBottom: bottomPad }]}
      showsVerticalScrollIndicator={false}
      overScrollMode="never"
    >
      <ProfileHeader
        user={user}
        posts={posts}
        nowPlaying={nowPlaying}
        spotifyConnected={spotifyConnected}
        friendsCount={friendsCount}
        totalLikes={totalLikes}
      />
      <QuickActions />
      <PostsGrid posts={posts} />
    </ScrollView>
  );
}

const rootStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flexGrow: 1 },
  loading: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
});