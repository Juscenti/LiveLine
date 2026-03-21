// ============================================================
// components/feed/PostCard.tsx — Masonry tile (Pinterest-style)
// ============================================================
import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, FEED } from '@/constants';
import { useAuthStore } from '@/stores/authStore';
import { useFeedStore } from '@/stores/feedStore';
import { formatApiError } from '@/utils/apiErrors';
import { getPostMediaAspectRatio, normalizeAspectFromPixels } from '@/utils/feedMasonry';
import { measureImageAspectFromUri } from '@/utils/imageAspect';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { FeedPost } from '@/types';

dayjs.extend(relativeTime);

export { getPostMediaAspectRatio } from '@/utils/feedMasonry';

interface Props {
  post: FeedPost;
  width: number;
  onPress: () => void;
}

/**
 * Masonry tile height from media aspect (Pinterest-style stagger).
 * `cover` fills each tile edge-to-edge.
 * - Max height: very tall portraits don’t swallow the feed.
 * - Min height: ultra-wide (w/h ≫ 1) used to make height = width/aspect tiny → “pill” strips; floor fixes that.
 */
const MAX_TILE_HEIGHT_FACTOR = 6;
const MIN_TILE_HEIGHT_FACTOR = 0.52;

export default function PostCard({ post, width, onPress }: Props) {
  const user = useAuthStore((s) => s.user);
  const deletePost = useFeedStore((s) => s.deletePost);
  const isOwner = user?.id === post.user_id;

  const uri =
    post.media_type === 'video'
      ? (post.thumbnail_url || '').trim()
      : (post.media_url || post.thumbnail_url || '').trim();
  const showImage = uri.length > 0;

  /**
   * Prefer decoded pixels (expo-image onLoad). Fallback: RN Image.getSize — onLoad can be 0×0 on some devices.
   */
  const [decodedAspect, setDecodedAspect] = useState<number | null>(null);
  useEffect(() => {
    setDecodedAspect(null);
  }, [post.id, uri]);

  useEffect(() => {
    if (!uri || !showImage) return;
    let cancelled = false;
    void measureImageAspectFromUri(uri).then((r) => {
      if (cancelled || r == null) return;
      setDecodedAspect((prev) => prev ?? r);
    });
    return () => {
      cancelled = true;
    };
  }, [uri, showImage, post.id]);

  const aspect = decodedAspect ?? getPostMediaAspectRatio(post);
  const naturalH = width / aspect;
  const imageHeight = Math.min(
    Math.max(naturalH, width * MIN_TILE_HEIGHT_FACTOR),
    width * MAX_TILE_HEIGHT_FACTOR,
  );

  const handleMenu = () => {
    if (!isOwner) {
      Alert.alert('Post', 'More options coming soon.');
      return;
    }
    Alert.alert('Delete this post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deletePost(post.id);
            } catch (e) {
              Alert.alert("Couldn't delete post", formatApiError(e));
            }
          })();
        },
      },
    ]);
  };

  return (
    <View style={[styles.card, { width }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.92}>
        <View style={[styles.media, { height: imageHeight, width, borderRadius: FEED.tileRadius }]}>
          {showImage ? (
            <Image
              source={{ uri, cacheKey: post.id }}
              style={[styles.image, { borderRadius: FEED.tileRadius }]}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              onLoad={(e) => {
                const pw = e.source.width;
                const ph = e.source.height;
                if (pw > 0 && ph > 0) {
                  setDecodedAspect(normalizeAspectFromPixels(pw, ph));
                }
              }}
            />
          ) : (
            <View style={[styles.videoPlaceholder, { borderRadius: FEED.tileRadius }]}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
          )}

          {post.media_type === 'video' && (
            <View style={styles.videoBadge}>
              <Text style={styles.videoBadgeText}>▶ {post.duration_sec?.toFixed(0) ?? '5'}s</Text>
            </View>
          )}

          {post.expires_at && (
            <View style={styles.expiryBadge}>
              <Text style={styles.expiryText}>{dayjs(post.expires_at).fromNow(true)}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.usernameTouch} onPress={onPress} activeOpacity={0.7}>
          <Text style={styles.username} numberOfLines={1}>
            {post.author?.display_name ?? post.author?.username ?? '—'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleMenu}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={isOwner ? 'Post options' : 'Post options'}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textTertiary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'visible',
  },
  media: {
    position: 'relative',
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  playIcon: { fontSize: 36, color: COLORS.textSecondary },
  videoBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  videoBadgeText: { color: '#fff', fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.medium },
  expiryBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,255,148,0.2)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  expiryText: { color: COLORS.accent, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.medium },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: FEED.footerMinHeight,
    paddingTop: 6,
    paddingHorizontal: 2,
  },
  usernameTouch: {
    flex: 1,
    marginRight: 8,
  },
  username: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
  },
});
