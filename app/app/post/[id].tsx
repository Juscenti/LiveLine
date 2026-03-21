// ============================================================
// app/post/[id].tsx — Post detail / comments modal
// ============================================================
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { postsApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useFeedStore } from '@/stores/feedStore';
import { formatApiError } from '@/utils/apiErrors';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import { getPostMediaAspectRatio } from '@/components/feed/PostCard';
import { useResponsive } from '@/utils/responsive';
import MusicBadge from '@/components/music/MusicBadge';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { FeedPost } from '@/types';

dayjs.extend(relativeTime);

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const user = useAuthStore((s) => s.user);
  const { posts, likePost, unlikePost, deletePost } = useFeedStore();
  const [post, setPost] = useState<FeedPost | null>(posts.find((p) => p.id === id) ?? null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    const existing = posts.find((p) => p.id === id);
    if (existing) {
      setPost(existing);
      return;
    }
    if (post) return; // already loaded via deep-link fetch

    postsApi.getPost(id).then(({ data }) => {
      // Expected shape: { data: { ...post } }
      const nextPost = (data?.data ?? data) as FeedPost;
      setPost(nextPost);
    }).catch(() => {});
  }, [id, posts, post]);

  useEffect(() => {
    if (!id) return;
    postsApi.recordView(id).catch(() => {});
    setLoadingComments(true);
    postsApi.getComments(id)
      .then(({ data }) => setComments(data.data))
      .finally(() => setLoadingComments(false));
  }, [id]);

  if (!post) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  const handleComment = async () => {
    if (!commentText.trim() || !id) return;
    setSubmitting(true);
    try {
      const { data } = await postsApi.addComment(id, commentText.trim());
      setComments((c) => [...c, data.data]);
      setCommentText('');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLike = () => {
    post.user_has_liked ? unlikePost(post.id) : likePost(post.id);
  };

  const isOwner = user?.id === post.user_id;

  const handleDeletePost = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await deletePost(id);
      router.back();
    } catch (e) {
      Alert.alert("Couldn't delete post", formatApiError(e));
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeletePost = () => {
    Alert.alert('Delete this post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void handleDeletePost();
        },
      },
    ]);
  };

  const imageUri = post.thumbnail_url ?? post.media_url;
  const mediaAspect = getPostMediaAspectRatio(post);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            paddingHorizontal: r.padH,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} disabled={deleting}>
          <Text style={[styles.backBtn, { fontSize: FONTS.sizes.base * r.scale }]}>‹ Back</Text>
        </TouchableOpacity>
        {isOwner ? (
          <TouchableOpacity onPress={confirmDeletePost} disabled={deleting} activeOpacity={0.7}>
            <Text
              style={[
                styles.deleteHeader,
                { fontSize: FONTS.sizes.base * r.scale, opacity: deleting ? 0.45 : 1 },
              ]}
            >
              Delete
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerRightSpacer} />
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Media — container matches stored aspect (no forced square crop) */}
        <View
          style={[
            styles.media,
            {
              aspectRatio: mediaAspect,
              maxWidth: r.maxFeedWidth,
              alignSelf: 'center',
            },
          ]}
        >
          {post.media_type === 'image' ? (
            imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.mediaImage}
                contentFit="contain"
              />
            ) : (
              <View style={styles.mediaPlaceholder}>
                <Text style={styles.mediaPlaceholderText}>🖼</Text>
              </View>
            )
          ) : (
            post.media_url ? (
              <Video
                source={{ uri: post.media_url }}
                style={styles.mediaImage}
                shouldPlay={false}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
              />
            ) : (
              <View style={styles.mediaPlaceholder}>
                <Text style={styles.mediaPlaceholderText}>▶</Text>
              </View>
            )
          )}
        </View>

        {/* Author row */}
        <TouchableOpacity
          style={[styles.authorRow, { paddingHorizontal: r.padH }]}
          onPress={() => router.push(`/profile/${post.user_id}`)}
        >
          <View style={styles.authorAvatar}>
            <Text style={styles.authorInitial}>
              {(post.author?.display_name ?? post.author?.username ?? '?')[0].toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.authorName}>{post.author?.display_name ?? post.author?.username}</Text>
            <Text style={styles.authorTime}>{dayjs(post.created_at).fromNow()}</Text>
          </View>
        </TouchableOpacity>

        {/* Caption */}
        {post.caption && (
          <Text style={[styles.caption, { paddingHorizontal: r.padH }]}>{post.caption}</Text>
        )}

        {/* Music */}
        {post.music && (
          <MusicBadge
            track={post.music}
            style={{ marginTop: SPACING.md, marginHorizontal: r.padH }}
          />
        )}

        {/* Actions */}
        <View style={[styles.actions, { paddingHorizontal: r.padH }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={toggleLike}>
            <Text style={[styles.actionIcon, post.user_has_liked && styles.actionIconLiked]}>
              {post.user_has_liked ? '❤️' : '🤍'}
            </Text>
            <Text style={styles.actionCount}>{post.like_count}</Text>
          </TouchableOpacity>
          <View style={styles.actionBtn}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionCount}>{comments.length}</Text>
          </View>
          <View style={styles.actionBtn}>
            <Text style={styles.actionIcon}>👁</Text>
            <Text style={styles.actionCount}>{post.view_count}</Text>
          </View>
        </View>

        {/* Comments */}
        <View style={[styles.commentsSection, { paddingHorizontal: r.padH }]}>
          <Text style={styles.commentsTitle}>Comments</Text>
          {loadingComments && <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.md }} />}
          {comments.map((c) => (
            <View key={c.id} style={styles.comment}>
              <Text style={styles.commentAuthor}>{c.author?.username ?? 'unknown'}</Text>
              <Text style={styles.commentBody}>{c.body}</Text>
              <Text style={styles.commentTime}>{dayjs(c.created_at).fromNow()}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Comment input */}
      <View style={[styles.inputRow, { paddingHorizontal: r.padH, paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
        <TextInput
          style={styles.commentInput}
          placeholder="Add a comment..."
          placeholderTextColor={COLORS.textTertiary}
          value={commentText}
          onChangeText={setCommentText}
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !commentText.trim() && styles.sendBtnDisabled]}
          onPress={handleComment}
          disabled={!commentText.trim() || submitting}
        >
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  header: { paddingBottom: SPACING.sm },
  headerRightSpacer: { width: 56 },
  backBtn: { color: COLORS.accent, fontWeight: FONTS.weights.semibold },
  deleteHeader: { color: COLORS.error, fontWeight: FONTS.weights.semibold },
  media: {
    width: '100%',
    backgroundColor: COLORS.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaImage: { width: '100%', height: '100%' },
  mediaPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaPlaceholderText: { fontSize: 48, color: COLORS.textTertiary },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.base,
  },
  authorAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center', alignItems: 'center',
  },
  authorInitial: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold },
  authorName: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.sm },
  authorTime: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs },
  caption: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 20 },
  actions: {
    flexDirection: 'row',
    gap: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  actionIcon: { fontSize: 20 },
  actionIconLiked: {},
  actionCount: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  commentsSection: { paddingVertical: SPACING.base },
  commentsTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, marginBottom: SPACING.md },
  comment: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderSubtle,
  },
  commentAuthor: { color: COLORS.accent, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  commentBody: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, marginTop: 2, lineHeight: 18 },
  commentTime: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs, marginTop: 2 },
  inputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    paddingTop: SPACING.base,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  commentInput: {
    flex: 1, backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    color: COLORS.textPrimary, fontSize: FONTS.sizes.sm,
  },
  sendBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
});
