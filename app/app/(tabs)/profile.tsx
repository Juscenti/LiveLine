// ============================================================
// app/(tabs)/profile.tsx — Own profile (centered layout)
// ============================================================
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  Image, ActivityIndicator, Animated, Pressable, useWindowDimensions, Dimensions,
  Share, Modal,
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
import type { Post, MusicTrack } from '@/types';
import { Image as ExpoImage } from 'expo-image';

type TabKey = 'posts' | 'likes' | 'tagged';

// ── Format helpers ───────────────────────────────────────────
function formatJoinedDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const month = d.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  return `joined ${month} ${d.getFullYear()}`;
}

function formatFullDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

// ── Top floating bar (settings + info) ───────────────────────
function TopFloatBar({
  onPressSettings,
  onPressInfo,
  topInset,
  hasBanner,
}: {
  onPressSettings: () => void;
  onPressInfo: () => void;
  topInset: number;
  hasBanner: boolean;
}) {
  return (
    <View pointerEvents="box-none" style={[topBarStyles.row, { top: topInset + 14 }]}>
      <Pressable
        onPress={onPressSettings}
        style={({ pressed }) => [
          topBarStyles.circle,
          hasBanner && topBarStyles.circleOnBanner,
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={8}
      >
        <Ionicons name="settings-outline" size={18} color={COLORS.textPrimary} />
      </Pressable>
      <Pressable
        onPress={onPressInfo}
        style={({ pressed }) => [
          topBarStyles.circle,
          hasBanner && topBarStyles.circleOnBanner,
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Profile info"
        hitSlop={8}
      >
        <Ionicons name="information-circle-outline" size={20} color={COLORS.textPrimary} />
      </Pressable>
    </View>
  );
}

const topBarStyles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: SPACING.base,
    right: SPACING.base,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 30,
  },
  circle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,28,0.9)',
  },
  circleOnBanner: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});

// ── Now Playing pill ─────────────────────────────────────────
function NowPlayingPill({
  track,
  spotifyConnected,
  onPress,
}: {
  track: MusicTrack | null;
  spotifyConnected: boolean;
  onPress: () => void;
}) {
  const hasTrack = !!track?.song;
  const isPlaying = !!track?.is_currently_playing;

  let label = 'CONNECT SPOTIFY';
  if (hasTrack) label = isPlaying ? 'NOW PLAYING' : 'LAST PLAYED';
  else if (spotifyConnected) label = 'NOTHING PLAYING';

  const subline = hasTrack
    ? `${track!.song}${track!.artist ? ` · ${track!.artist}` : ''}`
    : spotifyConnected
      ? 'play a song to share your vibe'
      : 'link spotify to share your vibe';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pillStyles.wrap, pressed && { opacity: 0.85 }]}
    >
      <View style={pillStyles.iconBox}>
        <Ionicons name="stats-chart" size={14} color={COLORS.accent} />
      </View>
      <View style={pillStyles.center}>
        <View style={pillStyles.labelRow}>
          <View style={pillStyles.dot} />
          <Text style={pillStyles.label}>{label}</Text>
        </View>
        <Text style={pillStyles.song} numberOfLines={1}>
          {hasTrack ? (
            <>
              {track!.song}
              {track!.artist ? <Text style={pillStyles.artist}> · {track!.artist}</Text> : null}
            </>
          ) : (
            <Text style={pillStyles.artist}>{subline}</Text>
          )}
        </Text>
      </View>
      <View style={pillStyles.spotifyBadge}>
        <Ionicons name="musical-note" size={14} color={COLORS.spotify} />
      </View>
    </Pressable>
  );
}

const pillStyles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#161616',
    borderRadius: RADIUS.full,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: SPACING.md,
    maxWidth: '92%',
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,255,148,0.12)',
  },
  center: { flexShrink: 1, paddingRight: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.accent },
  label: {
    fontSize: 10,
    fontWeight: FONTS.weights.bold,
    color: COLORS.accent,
    letterSpacing: 0.8,
  },
  song: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.semibold,
    marginTop: 1,
  },
  artist: {
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.regular,
  },
  spotifyBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(29,185,84,0.12)',
  },
});

// ── Stats row ────────────────────────────────────────────────
function Stat({ value, label, onPress }: { value: number | string; label: string; onPress?: () => void }) {
  const inner = (
    <View style={statStyles.col}>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.7 }]}>
        {inner}
      </Pressable>
    );
  }
  return <View style={{ flex: 1 }}>{inner}</View>;
}

const statStyles = StyleSheet.create({
  col: { alignItems: 'center', gap: 1 },
  value: {
    fontSize: 22,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  label: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});

// ── Profile header (banner + centered identity + actions) ────
function ProfileHeader({
  user,
  posts,
  nowPlaying,
  spotifyConnected,
  friendsCount,
  totalLikes,
  onShare,
}: {
  user: any;
  posts: Post[];
  nowPlaying: MusicTrack | null;
  spotifyConnected: boolean;
  friendsCount: number;
  totalLikes: number;
  onShare: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
    ]).start();
  }, []);

  const initial =
    (user.display_name ?? user.username ?? '?')[0]?.toUpperCase() ?? '?';

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {/* Banner (kept feature). When absent, leaves a blank top region for the floating buttons. */}
      <View style={headerStyles.bannerContainer}>
        {user.banner_url ? (
          <>
            <Image source={{ uri: user.banner_url }} style={headerStyles.banner} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.35)', COLORS.bg]}
              locations={[0.35, 0.78, 1]}
              style={headerStyles.bannerGradient}
            />
          </>
        ) : null}
      </View>

      {/* Avatar — centered, green ring */}
      <View style={[
        headerStyles.avatarRow,
        { marginTop: user.banner_url ? -(AVATAR_RING / 2) : SPACING.sm },
      ]}>
        <View style={headerStyles.avatarRing}>
          <View style={headerStyles.avatarInner}>
            {user.profile_picture_url ? (
              <Image source={{ uri: user.profile_picture_url }} style={headerStyles.avatar} />
            ) : (
              <View style={[headerStyles.avatar, headerStyles.avatarPlaceholder]}>
                <Text style={headerStyles.avatarInitial}>{initial}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Name · @handle · joined */}
      <View style={headerStyles.identity}>
        <Text style={headerStyles.displayName} numberOfLines={1}>
          {user.display_name ?? user.username}
        </Text>
        <Text style={headerStyles.subline} numberOfLines={1}>
          @{user.username}
        </Text>
        {user.bio ? <Text style={headerStyles.bio}>{user.bio}</Text> : null}
      </View>

      {/* Now Playing pill — always visible (with connect-fallback when offline) */}
      <NowPlayingPill
        track={nowPlaying}
        spotifyConnected={spotifyConnected}
        onPress={() => router.push('/music/connect')}
      />


      {/* Edit profile + Share profile */}
      <View style={headerStyles.actions}>
        <View style={headerStyles.actionSlot}>
          <Pressable
            style={({ pressed }) => [headerStyles.editBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/profile/edit')}
          >
            <Text style={headerStyles.editBtnText}>edit profile</Text>
          </Pressable>
        </View>
        <View style={headerStyles.actionSlot}>
          <Pressable
            style={({ pressed }) => [headerStyles.shareBtn, pressed && { opacity: 0.7 }]}
            onPress={onShare}
          >
            <Text style={headerStyles.shareBtnText}>share profile</Text>
          </Pressable>
        </View>
      </View>

      {/* Stats row */}
      <View style={headerStyles.statsBar}>
        <Stat value={formatCount(posts.length)} label="posts" />
        <Stat
          value={formatCount(friendsCount)}
          label="friends"
          onPress={() => router.push('/(tabs)/friends')}
        />
        <Stat value={formatCount(totalLikes)} label="likes" />
      </View>
    </Animated.View>
  );
}

const AVATAR_SIZE = 84;
const AVATAR_RING = AVATAR_SIZE + 10;

const headerStyles = StyleSheet.create({
  bannerContainer: {
    height: 130,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.sm,
  },
  banner: { width: '100%', height: '100%' },
  bannerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 70,
  },
  avatarRow: {
    alignItems: 'center',
    zIndex: 10,
  },
  avatarRing: {
    width: AVATAR_RING,
    height: AVATAR_RING,
    borderRadius: AVATAR_RING / 2,
    borderWidth: 2,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarInner: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: COLORS.bgElevated,
  },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: {
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  identity: {
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    marginTop: SPACING.md,
    gap: 3,
  },
  displayName: {
    fontSize: 26,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.6,
  },
  subline: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  bio: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textPrimary,
    marginTop: 6,
    lineHeight: 20,
    opacity: 0.85,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    marginHorizontal: SPACING.base,
  },
  actionSlot: {
    flex: 1,
    alignItems: 'center',
  },
  editBtn: {
    width: '95%',
    borderRadius: RADIUS.full,
    paddingVertical: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  editBtnText: {
    color: COLORS.textInverse,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.bold,
  },
  shareBtn: {
    width: '95%',
    borderRadius: RADIUS.full,
    paddingVertical: 10,
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
  },
  shareBtnText: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.bold,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
});

// ── Tab bar (posts / likes / tagged) ─────────────────────────
function ProfileTabs({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  const tabs: TabKey[] = ['posts', 'likes', 'tagged'];
  return (
    <View style={tabStyles.row}>
      {tabs.map((t) => {
        const isActive = active === t;
        return (
          <Pressable
            key={t}
            onPress={() => onChange(t)}
            style={({ pressed }) => [
              tabStyles.pill,
              isActive ? tabStyles.pillActive : tabStyles.pillIdle,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[tabStyles.label, isActive ? tabStyles.labelActive : tabStyles.labelIdle]}>
              {t}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.base,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  pill: {
    paddingHorizontal: SPACING.base,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
  },
  pillActive: { backgroundColor: COLORS.accent },
  pillIdle: { backgroundColor: COLORS.bgElevated },
  label: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
  },
  labelActive: { color: COLORS.textInverse },
  labelIdle: { color: COLORS.textSecondary },
});

// ── Rich profile post card (3-col grid) ──────────────────────
function ProfilePostCard({
  post,
  size,
  user,
  onPress,
  showAuthor,
}: {
  post: Post;
  size: number;
  user: any;
  onPress: () => void;
  showAuthor: boolean;
}) {
  const aspect = 3 / 4; // width / height — taller portrait tiles like the mockup
  const tileH = size / aspect;
  const thumb = post.thumbnail_url ?? post.media_url;
  const songTitle = post.music?.song;
  // On tabs that may surface other users' posts (tagged/likes), prefer the post's
  // author for the chip; on the profile owner's own posts it falls back to `user`.
  const chipUser = post.author ?? user;
  const initial =
    (chipUser?.display_name ?? chipUser?.username ?? '?')[0]?.toUpperCase() ?? '?';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: size, height: tileH }, pressed && { opacity: 0.92 }]}>
      <View style={cardStyles.tile}>
        {thumb ? (
          <ExpoImage
            source={{ uri: thumb }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, cardStyles.placeholder]} />
        )}

        {/* Top dim gradient for legibility */}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent']}
          style={cardStyles.topShade}
        />

        {/* User chip — hidden on the Posts tab since the viewer is already on this user's profile */}
        {showAuthor ? (
          <View style={cardStyles.userChip}>
            <View style={cardStyles.miniRing}>
              {chipUser?.profile_picture_url ? (
                <Image source={{ uri: chipUser.profile_picture_url }} style={cardStyles.miniAvatar} />
              ) : (
                <View style={[cardStyles.miniAvatar, cardStyles.miniAvatarPlaceholder]}>
                  <Text style={cardStyles.miniInitial}>{initial}</Text>
                </View>
              )}
            </View>
            <Text style={cardStyles.userName} numberOfLines={1}>
              {chipUser?.username ?? 'you'}
            </Text>
          </View>
        ) : null}

        {/* Music pill (if present) */}
        {songTitle ? (
          <View style={cardStyles.songPill}>
            <Ionicons name="musical-note" size={9} color={COLORS.accent} />
            <Text style={cardStyles.songText} numberOfLines={1}>
              {songTitle.toUpperCase()}
            </Text>
          </View>
        ) : null}

        {/* Bottom dim gradient */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={cardStyles.bottomShade}
        />

        {/* Caption + likes */}
        <View style={cardStyles.bottomRow}>
          <Text style={cardStyles.caption} numberOfLines={2}>
            {post.caption ?? ''}
          </Text>
          <View style={cardStyles.likes}>
            <Ionicons name="heart" size={10} color="#fff" />
            <Text style={cardStyles.likesText}>{formatCount(post.like_count ?? 0)}</Text>
          </View>
        </View>

        {post.media_type === 'video' ? (
          <View style={cardStyles.videoBadge}>
            <Ionicons name="play" size={10} color="#fff" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.bgElevated,
  },
  placeholder: {
    backgroundColor: COLORS.bgElevated,
  },
  topShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 70,
  },
  bottomShade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  userChip: {
    position: 'absolute',
    top: 7,
    left: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: 8,
    paddingLeft: 3,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    maxWidth: '88%',
  },
  miniRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  miniAvatar: { width: 17, height: 17, borderRadius: 9 },
  miniAvatarPlaceholder: {
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniInitial: { fontSize: 9, color: COLORS.textPrimary, fontWeight: FONTS.weights.bold },
  userName: {
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.semibold,
  },
  songPill: {
    position: 'absolute',
    top: 38,
    left: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    maxWidth: '90%',
  },
  songText: {
    fontSize: 9,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 0.4,
  },
  bottomRow: {
    position: 'absolute',
    bottom: 7,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 5,
  },
  caption: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.semibold,
    lineHeight: 14,
  },
  likes: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likesText: {
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.semibold,
  },
  videoBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
});

// ── Posts grid ───────────────────────────────────────────────
function PostsGrid({
  posts,
  user,
  emptyTab,
  showAuthor,
}: {
  posts: Post[];
  user: any;
  emptyTab: TabKey;
  showAuthor: boolean;
}) {
  const { width: winW } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const cols = 3;
  const gutter = 6;
  const padH = SPACING.base * 2;
  const layoutW = winW > 0 ? winW : Dimensions.get('window').width;
  const thumbW = Math.max(1, (layoutW - padH - gutter * (cols - 1)) / cols);

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 280, useNativeDriver: true,
    }).start();
  }, [emptyTab, posts.length]);

  const emptyCopy = useMemo(() => {
    switch (emptyTab) {
      case 'likes':
        return { title: 'No likes yet', sub: 'Posts you like will live here' };
      case 'tagged':
        return { title: 'No tagged posts', sub: 'When friends tag you it shows up here' };
      default:
        return { title: 'No posts yet', sub: 'Share your first moment' };
    }
  }, [emptyTab]);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      {posts.length === 0 ? (
        <View style={gridStyles.empty}>
          <Text style={gridStyles.emptyIcon}>📷</Text>
          <Text style={gridStyles.emptyText}>{emptyCopy.title}</Text>
          <Text style={gridStyles.emptySubtext}>{emptyCopy.sub}</Text>
        </View>
      ) : (
        <View style={[gridStyles.grid, { gap: gutter }]}>
          {posts.map((post) => (
            <ProfilePostCard
              key={post.id}
              post={post}
              size={thumbW}
              user={user}
              onPress={() => router.push(`/post/${post.id}`)}
              showAuthor={showAuthor}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const gridStyles = StyleSheet.create({
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

// ── Profile info modal (bottom sheet) ────────────────────────
function ProfileInfoModal({
  visible,
  onClose,
  rows,
}: {
  visible: boolean;
  onClose: () => void;
  rows: { label: string; value: string }[];
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={infoModalStyles.backdrop} onPress={onClose}>
        <Pressable style={infoModalStyles.sheet} onPress={() => {}}>
          <View style={infoModalStyles.handle} />
          <View style={infoModalStyles.header}>
            <Text style={infoModalStyles.title}>profile info</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </Pressable>
          </View>
          <View>
            {rows.map((row, i) => (
              <View
                key={row.label}
                style={[
                  infoModalStyles.row,
                  i < rows.length - 1 && infoModalStyles.rowDivider,
                ]}
              >
                <Text style={infoModalStyles.rowLabel}>{row.label}</Text>
                <Text style={infoModalStyles.rowValue} numberOfLines={1}>
                  {row.value || '—'}
                </Text>
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const infoModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bgSheet,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.base,
    paddingTop: 8,
    paddingBottom: SPACING.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.bold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: SPACING.base,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderSubtle,
  },
  rowLabel: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
  },
  rowValue: {
    flexShrink: 1,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    textAlign: 'right',
  },
});

// ── Root screen ──────────────────────────────────────────────
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const friendsCount = useFriendsInboxStore((s) => s.friends.length);
  const { nowPlaying, connectedPlatforms } = useMusicStore();
  const spotifyConnected = useMemo(
    () => connectedPlatforms.includes('spotify'),
    [connectedPlatforms],
  );
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('posts');
  const [infoOpen, setInfoOpen] = useState(false);

  const totalLikes = useMemo(
    () => posts.reduce((sum, p) => sum + (typeof p.like_count === 'number' ? p.like_count : 0), 0),
    [posts],
  );

  const fetchPosts = useCallback(() => {
    if (!user?.id) return;
    postsApi
      .getUserPosts(user.id)
      .then(({ data }) => {
        const rows = Array.isArray(data?.data) ? data.data : [];
        setPosts(rows);
      })
      .catch(() => {
        // Keep existing posts if the request fails
      });
  }, [user?.id]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (!user?.id) return;
    void useFriendsInboxStore.getState().fetch({ withSpinner: false, silent: true });
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchPosts();
      void useFriendsInboxStore.getState().fetch({ withSpinner: false, silent: true });
    }, [fetchPosts]),
  );

  const handleShare = useCallback(async () => {
    if (!user?.username) return;
    try {
      await Share.share({
        message: `Check out @${user.username} on Liveline`,
      });
    } catch {
      // user-cancelled or unavailable — no-op
    }
  }, [user?.username]);

  const infoRows = useMemo(
    () => [
      { label: 'username', value: user?.username ? `@${user.username}` : '' },
      { label: 'name', value: user?.display_name ?? '' },
      { label: 'email', value: session?.user?.email ?? '' },
      { label: 'date joined', value: formatFullDate(user?.created_at) },
      { label: 'total posts', value: formatCount(posts.length) },
      { label: 'total likes', value: formatCount(totalLikes) },
    ],
    [user?.username, user?.display_name, user?.created_at, session?.user?.email, posts.length, totalLikes],
  );

  const visiblePosts = activeTab === 'posts' ? posts : [];

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
    <View style={rootStyles.container}>
      <TopFloatBar
        topInset={insets.top}
        hasBanner={!!user.banner_url}
        onPressSettings={() => router.push('/settings')}
        onPressInfo={() => setInfoOpen(true)}
      />
      <ScrollView
        style={rootStyles.scroll}
        contentContainerStyle={[
          rootStyles.content,
          {
            paddingTop: user.banner_url ? insets.top + 8 : insets.top + 56,
            paddingBottom: bottomPad,
          },
        ]}
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
          onShare={handleShare}
        />
        <ProfileTabs active={activeTab} onChange={setActiveTab} />
        <PostsGrid
          posts={visiblePosts}
          user={user}
          emptyTab={activeTab}
          showAuthor={activeTab !== 'posts'}
        />
      </ScrollView>
      <ProfileInfoModal
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        rows={infoRows}
      />
    </View>
  );
}

const rootStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
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
