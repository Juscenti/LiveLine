// ============================================================
// app/profile/[id].tsx — Public user profile
// ============================================================
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { usersApi, postsApi, friendsApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import MusicBadge from '@/components/music/MusicBadge';
import PostThumb from '@/components/feed/PostThumb';
import type { User, Post } from '@/types';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me } = useAuthStore();
  const [profile, setProfile] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending' | 'accepted'>('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      usersApi.getProfile(id),
      postsApi.getUserPosts(id),
    ]).then(([profileRes, postsRes]) => {
      setProfile(profileRes.data.data);
      setPosts(postsRes.data.data);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleFriendAction = async () => {
    if (!id) return;
    try {
      if (friendStatus === 'none') {
        await friendsApi.sendRequest(id);
        setFriendStatus('pending');
      } else if (friendStatus === 'accepted') {
        Alert.alert('Remove friend?', '', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove', style: 'destructive',
            onPress: async () => {
              await friendsApi.remove(id);
              setFriendStatus('none');
            },
          },
        ]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (!profile) return null;

  const isMe = me?.id === id;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Back */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.topUsername}>@{profile.username}</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Banner */}
      <View style={styles.bannerContainer}>
        {profile.banner_url
          ? <Image source={{ uri: profile.banner_url }} style={styles.banner} />
          : <View style={[styles.banner, { backgroundColor: COLORS.bgElevated }]} />}
      </View>

      {/* Avatar + Action */}
      <View style={styles.avatarRow}>
        <View style={styles.avatarBorder}>
          {profile.profile_picture_url
            ? <Image source={{ uri: profile.profile_picture_url }} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {(profile.display_name ?? profile.username)[0].toUpperCase()}
                </Text>
              </View>}
        </View>
        {!isMe && (
          <TouchableOpacity
            style={[
              styles.friendBtn,
              friendStatus === 'accepted' && styles.friendBtnAccepted,
              friendStatus === 'pending' && styles.friendBtnPending,
            ]}
            onPress={handleFriendAction}
          >
            <Text style={[
              styles.friendBtnText,
              friendStatus !== 'none' && styles.friendBtnTextAlt,
            ]}>
              {friendStatus === 'none' && 'Add friend'}
              {friendStatus === 'pending' && 'Requested'}
              {friendStatus === 'accepted' && 'Friends ✓'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.displayName}>{profile.display_name ?? profile.username}</Text>
        <Text style={styles.username}>@{profile.username}</Text>
        {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
      </View>

      {/* Posts grid */}
      <View style={styles.grid}>
        {posts.map((post) => (
          <PostThumb
            key={post.id}
            post={post}
            size={120}
            onPress={() => router.push(`/post/${post.id}`)}
          />
        ))}
        {posts.length === 0 && (
          <Text style={styles.noPosts}>No moments yet</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: SPACING.base, paddingBottom: SPACING.sm,
  },
  backBtn: { color: COLORS.textPrimary, fontSize: 28 },
  topUsername: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold },
  bannerContainer: { height: 120 },
  banner: { width: '100%', height: '100%' },
  avatarRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: SPACING.base, marginTop: -32,
  },
  avatarBorder: { borderWidth: 3, borderColor: COLORS.bg, borderRadius: 999 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: { backgroundColor: COLORS.bgElevated, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.lg },
  friendBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, marginBottom: 4,
  },
  friendBtnAccepted: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  friendBtnPending: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  friendBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  friendBtnTextAlt: { color: COLORS.textSecondary },
  info: { paddingHorizontal: SPACING.base, paddingTop: SPACING.md, gap: 4 },
  displayName: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold, color: COLORS.textPrimary },
  username: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  bio: { fontSize: FONTS.sizes.sm, color: COLORS.textPrimary, marginTop: SPACING.sm, lineHeight: 20 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: SPACING.xs, padding: SPACING.base, paddingTop: SPACING.md,
  },
  noPosts: { color: COLORS.textTertiary, fontSize: FONTS.sizes.sm, padding: SPACING.md },
});
