// ============================================================
// app/profile/[id].tsx — Public user profile
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usersApi, postsApi, friendsApi } from '@/services/api';
import { getOrCreateDirectConversation } from '@/services/conversations';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING, FONTS, FEED } from '@/constants';
import PostThumb from '@/components/feed/PostThumb';
import { AppHeader, PillButton, UserAvatar, UserNameBlock } from '@/components/shared';
import { formatApiError } from '@/utils/apiErrors';
import type { User, Post } from '@/types';

type RelStatus =
  | 'none'
  | 'accepted'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'declined'
  | 'blocked';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const [profile, setProfile] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [rel, setRel] = useState<{ status: RelStatus; friendshipId: string | null }>({
    status: 'none',
    friendshipId: null,
  });
  const [chatLoading, setChatLoading] = useState(false);

  const isMe = me?.id === id;

  useEffect(() => {
    if (!id) return;
    Promise.all([usersApi.getProfile(id), postsApi.getUserPosts(id)])
      .then(([profileRes, postsRes]) => {
        setProfile(profileRes.data?.data ?? null);
        const raw = postsRes.data?.data;
        setPosts(Array.isArray(raw) ? raw : []);
      })
      .catch(() => {
        setProfile(null);
        setPosts([]);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const loadRelationship = useCallback(async () => {
    if (!id || isMe) return;
    try {
      const r = await friendsApi.getStatus(id);
      const d = r.data.data ?? r.data;
      setRel({
        status: (d?.status as RelStatus) ?? 'none',
        friendshipId: d?.friendshipId ?? null,
      });
    } catch {
      setRel({ status: 'none', friendshipId: null });
    }
  }, [id, isMe]);

  useEffect(() => {
    void loadRelationship();
  }, [loadRelationship]);

  const openChat = async () => {
    if (!id) return;
    setChatLoading(true);
    try {
      const r = await getOrCreateDirectConversation(id);
      if (r.ok) router.push(`/messages/${r.conversationId}`);
      else Alert.alert('Could not open chat', r.message);
    } finally {
      setChatLoading(false);
    }
  };

  const sendRequest = async () => {
    if (!id) return;
    try {
      await friendsApi.sendRequest(id);
      await loadRelationship();
    } catch (e: unknown) {
      Alert.alert('Error', formatApiError(e));
    }
  };

  const acceptIncoming = async () => {
    if (!rel.friendshipId) return;
    try {
      await friendsApi.acceptRequest(rel.friendshipId);
      await loadRelationship();
    } catch (e: unknown) {
      Alert.alert('Error', formatApiError(e));
    }
  };

  const declineIncoming = async () => {
    if (!rel.friendshipId) return;
    try {
      await friendsApi.declineRequest(rel.friendshipId);
      await loadRelationship();
    } catch (e: unknown) {
      Alert.alert('Error', formatApiError(e));
    }
  };

  const confirmRemove = () => {
    if (!id) return;
    Alert.alert('Remove friend?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await friendsApi.remove(id);
            await loadRelationship();
          } catch (e: unknown) {
            Alert.alert('Error', formatApiError(e));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (!profile) return null;

  const profileCols = 3;
  const profileGutter = 6;
  const profilePadH = SPACING.base * 2;
  const profileLayoutW = winW > 0 ? winW : Dimensions.get('window').width;
  const profileThumbW = Math.max(
    1,
    (profileLayoutW - profilePadH - profileGutter * (profileCols - 1)) / profileCols,
  );

  const renderFriendActions = () => {
    if (isMe) return null;

    switch (rel.status) {
      case 'accepted':
        return (
          <View style={styles.actionRow}>
            <PillButton
              label="Message"
              onPress={() => void openChat()}
              loading={chatLoading}
              style={styles.actionGrow}
            />
            <PillButton
              label="Friends"
              variant="outline"
              onPress={confirmRemove}
              style={styles.actionGrow}
            />
          </View>
        );
      case 'pending_incoming':
        return (
          <View style={styles.actionRow}>
            <PillButton label="Accept" onPress={() => void acceptIncoming()} style={styles.actionGrow} />
            <PillButton
              label="Decline"
              variant="outline"
              onPress={() => void declineIncoming()}
              style={styles.actionGrow}
            />
          </View>
        );
      case 'pending_outgoing':
        return <PillButton label="Requested" variant="muted" disabled />;
      case 'blocked':
        return <PillButton label="Blocked" variant="muted" disabled />;
      default:
        return <PillButton label="Add friend" onPress={() => void sendRequest()} />;
    }
  };

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 24 }]}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: insets.top + 8 }}>
          <AppHeader title={`@${profile.username}`} onBack={() => router.back()} />
        </View>

        <View style={styles.bannerContainer}>
          {profile.banner_url ? (
            <Image source={{ uri: profile.banner_url }} style={styles.banner} />
          ) : (
            <View style={[styles.banner, { backgroundColor: COLORS.bgElevated }]} />
          )}
        </View>

        <View style={styles.avatarRow}>
          <UserAvatar user={profile} size="xl" bordered />
          {!isMe ? <View style={styles.actionCol}>{renderFriendActions()}</View> : null}
        </View>

        <View style={styles.info}>
          <UserNameBlock user={profile} variant="profile" />
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        </View>

        <View style={[styles.grid, { gap: profileGutter }]}>
          {posts.map((post) => (
            <PostThumb
              key={post.id}
              post={post}
              size={profileThumbW}
              aspectRatio={FEED.fallbackAspect}
              onPress={() => router.push(`/post/${post.id}`)}
            />
          ))}
          {posts.length === 0 ? <Text style={styles.noPosts}>No moments yet</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  bannerContainer: { height: 120 },
  banner: { width: '100%', height: '100%' },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.base,
    marginTop: -36,
  },
  actionCol: { alignItems: 'flex-end', marginBottom: 4, maxWidth: '58%' },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, justifyContent: 'flex-end' },
  actionGrow: { flex: 1, minWidth: 100 },
  info: { paddingHorizontal: SPACING.base, paddingTop: SPACING.md, gap: SPACING.xs },
  bio: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.base,
  },
  noPosts: { color: COLORS.textTertiary, fontSize: FONTS.sizes.sm, padding: SPACING.md },
});
