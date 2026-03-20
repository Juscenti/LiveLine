// ============================================================
// app/post/[id].tsx — Post detail / comments modal
// ============================================================
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  Image, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Video } from 'expo-av';
import { postsApi } from '@/services/api';
import { useFeedStore } from '@/stores/feedStore';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import MusicBadge from '@/components/music/MusicBadge';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { FeedPost } from '@/types';

dayjs.extend(relativeTime);

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, likePost, unlikePost } = useFeedStore();
  const { user } = useAuthStore();
  const [post, setPost] = useState<FeedPost | null>(posts.find((p) => p.id === id) ?? null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const imageUri = post.thumbnail_url ?? post.media_url;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Media placeholder */}
        <View style={styles.media}>
          {post.media_type === 'image' ? (
            imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.mediaImage}
                resizeMode="contain"
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
                useNativeControls={true}
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
          style={styles.authorRow}
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
        {post.caption && <Text style={styles.caption}>{post.caption}</Text>}

        {/* Music */}
        {post.music && <MusicBadge track={post.music} style={styles.music} />}

        {/* Actions */}
        <View style={styles.actions}>
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
        <View style={styles.commentsSection}>
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
      <View style={styles.inputRow}>
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
  header: { paddingTop: 56, paddingHorizontal: SPACING.base, paddingBottom: SPACING.sm },
  backBtn: { color: COLORS.accent, fontSize: FONTS.sizes.base },
  media: {
    width: '100%', aspectRatio: 1,
    backgroundColor: COLORS.bgCard,
    justifyContent: 'center', alignItems: 'center',
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
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.base,
  },
  authorAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center', alignItems: 'center',
  },
  authorInitial: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold },
  authorName: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.sm },
  authorTime: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs },
  caption: { paddingHorizontal: SPACING.base, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 20 },
  music: { marginHorizontal: SPACING.base, marginTop: SPACING.md },
  actions: {
    flexDirection: 'row', gap: SPACING.xl,
    paddingHorizontal: SPACING.base, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  actionIcon: { fontSize: 20 },
  actionIconLiked: {},
  actionCount: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  commentsSection: { padding: SPACING.base },
  commentsTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, marginBottom: SPACING.md },
  comment: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderSubtle,
  },
  commentAuthor: { color: COLORS.accent, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  commentBody: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, marginTop: 2, lineHeight: 18 },
  commentTime: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs, marginTop: 2 },
  inputRow: {
    flexDirection: 'row', gap: SPACING.sm, alignItems: 'center',
    padding: SPACING.base, borderTopWidth: 1, borderTopColor: COLORS.border,
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
