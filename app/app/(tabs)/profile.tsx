// ============================================================
// app/(tabs)/profile.tsx — Own profile
// ============================================================
import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, FlatList, Dimensions,
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
const THUMB = (width - SPACING.base * 2 - SPACING.xs * 2) / 3;

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { nowPlaying } = useMusicStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    postsApi.getUserPosts(user.id)
      .then(({ data }) => setPosts(data.data))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Banner */}
      <View style={styles.bannerContainer}>
        {user.banner_url
          ? <Image source={{ uri: user.banner_url }} style={styles.banner} />
          : <View style={[styles.banner, styles.bannerPlaceholder]} />}
      </View>

      {/* Avatar + Actions */}
      <View style={styles.avatarRow}>
        <View style={styles.avatarWrapper}>
          {user.profile_picture_url
            ? <Image source={{ uri: user.profile_picture_url }} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>{(user.display_name ?? user.username)[0].toUpperCase()}</Text>
              </View>}
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/profile/edit')}>
            <Text style={styles.editBtnText}>Edit profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push('/settings')}>
            <Text style={{ color: COLORS.textSecondary }}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.displayName}>{user.display_name ?? user.username}</Text>
        <Text style={styles.username}>@{user.username}</Text>
        {user.bio && <Text style={styles.bio}>{user.bio}</Text>}
      </View>

      {/* Now playing */}
      {nowPlaying && <MusicBadge track={nowPlaying} style={styles.music} />}

      {/* Friends shortcut */}
      <TouchableOpacity style={styles.friendsRow} onPress={() => router.push('/friends')}>
        <Text style={styles.friendsText}>Friends</Text>
        <Text style={styles.friendsArrow}>›</Text>
      </TouchableOpacity>

      {/* Connect music */}
      <TouchableOpacity style={styles.connectMusic} onPress={() => router.push('/music/connect')}>
        <Text style={styles.connectMusicText}>🎵  Connect music</Text>
      </TouchableOpacity>

      {/* Posts grid */}
      <View style={styles.grid}>
        {posts.map((post) => (
          <PostThumb
            key={post.id}
            post={post}
            size={THUMB}
            onPress={() => router.push(`/post/${post.id}`)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  bannerContainer: { height: 140 },
  banner: { width: '100%', height: '100%' },
  bannerPlaceholder: { backgroundColor: COLORS.bgElevated },
  avatarRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: SPACING.base, marginTop: -36,
  },
  avatarWrapper: {
    borderWidth: 3, borderColor: COLORS.bg, borderRadius: 999,
  },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { backgroundColor: COLORS.bgElevated, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.bold, color: COLORS.textPrimary },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, paddingBottom: 4 },
  editBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  editBtnText: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.medium },
  settingsBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  info: { paddingHorizontal: SPACING.base, paddingTop: SPACING.md, gap: 4 },
  displayName: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold, color: COLORS.textPrimary },
  username: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  bio: { fontSize: FONTS.sizes.sm, color: COLORS.textPrimary, marginTop: SPACING.sm, lineHeight: 20 },
  music: { marginHorizontal: SPACING.base, marginTop: SPACING.md },
  friendsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: SPACING.base, marginTop: SPACING.md,
    paddingVertical: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  friendsText: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.medium },
  friendsArrow: { color: COLORS.textSecondary, fontSize: FONTS.sizes.lg },
  connectMusic: {
    marginHorizontal: SPACING.base, marginTop: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    padding: SPACING.md, alignItems: 'center',
  },
  connectMusicText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: SPACING.xs, padding: SPACING.base, paddingTop: SPACING.md,
  },
});
