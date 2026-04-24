// ============================================================
// components/feed/PostCard.tsx — Masonry tile (Pinterest-style)
// ============================================================
import { useState, useEffect, useCallback, useRef, type Ref } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated } from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, FEED } from '@/constants';
import { useAuthStore } from '@/stores/authStore';
import { useFeedStore } from '@/stores/feedStore';
import { formatApiError } from '@/utils/apiErrors';
import { isSameUserId } from '@/utils/userDisplay';
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
  shouldPlay?: boolean;
  /** Optional ref on the media tile only (for feed play-zone hit-testing). */
  mediaMeasureRef?: Ref<View>;
}

const MAX_TILE_HEIGHT_FACTOR = 6;
const MIN_TILE_HEIGHT_FACTOR = 0.52;
const DOUBLE_TAP_DELAY = 280;

export default function PostCard({ post, width, onPress, shouldPlay = false, mediaMeasureRef }: Props) {
  const user = useAuthStore((s) => s.user);
  const deletePost = useFeedStore((s) => s.deletePost);
  const likePost = useFeedStore((s) => s.likePost);
  const unlikePost = useFeedStore((s) => s.unlikePost);
  const isOwner =
    user?.id != null &&
    (isSameUserId(user.id, post.user_id) || isSameUserId(user.id, post.author?.id));

  const thumbnailUri =
    post.media_type === 'video'
      ? (post.thumbnail_url || '').trim()
      : (post.media_url || post.thumbnail_url || '').trim();
  const showImage = thumbnailUri.length > 0;

  // ── Thumbnail-based aspect measurement (images + video thumbnails) ────────
  const [decodedAspect, setDecodedAspect] = useState<number | null>(null);
  useEffect(() => {
    setDecodedAspect(null);
  }, [post.id, thumbnailUri]);

  useEffect(() => {
    if (!thumbnailUri || !showImage) return;
    let cancelled = false;
    void measureImageAspectFromUri(thumbnailUri).then((r) => {
      if (cancelled || r == null) return;
      setDecodedAspect((prev) => prev ?? r);
    });
    return () => { cancelled = true; };
  }, [thumbnailUri, showImage, post.id]);

  // ── Video player (feed tile) ─────────────────────────────────────────────
  const isVideo = post.media_type === 'video';
  const videoSource = isVideo ? (post.media_url ?? null) : null;

  const videoPlayer = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const [videoFrameReady, setVideoFrameReady] = useState(false);
  useEffect(() => {
    setVideoFrameReady(false);
  }, [post.id, videoSource]);

  const prevShouldPlayRef = useRef(false);
  useEffect(() => {
    prevShouldPlayRef.current = false;
  }, [post.id]);

  useEffect(() => {
    if (!isVideo || !videoSource) return;
    const wasPlaying = prevShouldPlayRef.current;
    if (shouldPlay) {
      videoPlayer.play();
    } else {
      videoPlayer.pause();
      if (wasPlaying) {
        videoPlayer.currentTime = 0;
      }
    }
    prevShouldPlayRef.current = shouldPlay;
  }, [shouldPlay, isVideo, videoSource, videoPlayer]);

  const [trackAspect, setTrackAspect] = useState<number | null>(null);
  useEffect(() => { setTrackAspect(null); }, [post.id]);

  useEventListener(videoPlayer, 'videoTrackChange', ({ videoTrack }) => {
    const size = videoTrack?.size;
    if (size && size.width > 0 && size.height > 0) {
      setTrackAspect((prev) => prev ?? normalizeAspectFromPixels(size.width, size.height));
    }
  });

  // ── Aspect ───────────────────────────────────────────────────────────────
  const aspect = (() => {
    if (isVideo) {
      const w = Number(post.media_width);
      const h = Number(post.media_height);
      if (w > 0 && h > 0) return normalizeAspectFromPixels(w, h);
      if (decodedAspect != null) return decodedAspect;
      if (trackAspect != null) return trackAspect;
      return 9 / 16;
    }
    return decodedAspect ?? getPostMediaAspectRatio(post);
  })();

  const naturalH = width / aspect;
  const imageHeight = Math.min(
    Math.max(naturalH, width * MIN_TILE_HEIGHT_FACTOR),
    width * MAX_TILE_HEIGHT_FACTOR,
  );

  // ── Heart burst animation (RN Animated — no Reanimated) ──────────────────
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  const burstHeart = useCallback(() => {
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(heartOpacity, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
  }, [heartScale, heartOpacity]);

  // ── Like toggle ──────────────────────────────────────────────────────────
  const handleLike = useCallback(() => {
    if (post.user_has_liked) {
      void unlikePost(post.id);
    } else {
      void likePost(post.id);
      burstHeart();
    }
  }, [post.user_has_liked, post.id, likePost, unlikePost, burstHeart]);

  const handleDoubleTap = useCallback(() => {
    if (!post.user_has_liked) {
      void likePost(post.id);
    }
    burstHeart();
  }, [post.user_has_liked, post.id, likePost, burstHeart]);

  // ── Double-tap detection (timer-based, no GestureDetector) ───────────────
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMediaPress = useCallback(() => {
    tapCountRef.current += 1;
    if (tapCountRef.current === 1) {
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
        onPress();
      }, DOUBLE_TAP_DELAY);
    } else {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapCountRef.current = 0;
      handleDoubleTap();
    }
  }, [onPress, handleDoubleTap]);

  const handleMenu = useCallback(() => {
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
  }, [isOwner, deletePost, post.id]);

  return (
    <View style={[styles.card, { width }]}>
      <TouchableOpacity onPress={handleMediaPress} activeOpacity={0.92}>
        <View ref={mediaMeasureRef} style={[styles.media, { height: imageHeight, width, borderRadius: FEED.tileRadius }]}>
          {isVideo && post.media_url ? (
            <>
              <VideoView
                player={videoPlayer}
                style={[styles.fill, { borderRadius: FEED.tileRadius }]}
                contentFit="cover"
                nativeControls={false}
                useExoShutter={false}
                onFirstFrameRender={() => setVideoFrameReady(true)}
              />
              {showImage && !videoFrameReady ? (
                <Image
                  pointerEvents="none"
                  source={{ uri: thumbnailUri, cacheKey: post.id }}
                  style={[StyleSheet.absoluteFill, { borderRadius: FEED.tileRadius }]}
                  contentFit="cover"
                  transition={120}
                  cachePolicy="memory-disk"
                />
              ) : null}
            </>
          ) : showImage ? (
            <Image
              source={{ uri: thumbnailUri, cacheKey: post.id }}
              style={[styles.fill, { borderRadius: FEED.tileRadius }]}
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

          {isVideo && !shouldPlay && (
            <View style={styles.videoBadge}>
              <Text style={styles.videoBadgeText}>▶ {post.duration_sec?.toFixed(0) ?? '5'}s</Text>
            </View>
          )}

          {post.expires_at && (
            <View style={styles.expiryBadge}>
              <Text style={styles.expiryText}>{dayjs(post.expires_at).fromNow(true)}</Text>
            </View>
          )}

          {/* Heart burst overlay */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.heartOverlay,
              { transform: [{ scale: heartScale }], opacity: heartOpacity },
            ]}
          >
            <Ionicons name="heart" size={80} color="#fff" />
          </Animated.View>
        </View>
      </TouchableOpacity>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.usernameTouch} onPress={onPress} activeOpacity={0.7}>
          <Text style={styles.username} numberOfLines={1}>
            {post.author?.display_name ?? post.author?.username ?? '—'}
          </Text>
        </TouchableOpacity>

        {/* Like button */}
        <TouchableOpacity
          onPress={handleLike}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={styles.likeBtn}
          accessibilityLabel={post.user_has_liked ? 'Unlike post' : 'Like post'}
        >
          <Ionicons
            name={post.user_has_liked ? 'heart' : 'heart-outline'}
            size={18}
            color={post.user_has_liked ? '#ff3b55' : COLORS.textTertiary}
          />
          {post.like_count > 0 && (
            <Text style={[styles.likeCount, post.user_has_liked && styles.likeCountActive]}>
              {post.like_count}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleMenu}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={isOwner ? 'Delete post' : 'Post options'}
        >
          <Ionicons
            name={isOwner ? 'trash-outline' : 'ellipsis-horizontal'}
            size={18}
            color={isOwner ? COLORS.error : COLORS.textTertiary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'visible' },
  media: {
    position: 'relative',
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  fill: { width: '100%', height: '100%' },
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
  heartOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: FEED.footerMinHeight,
    paddingTop: 6,
    paddingHorizontal: 2,
  },
  usernameTouch: { flex: 1, marginRight: 8 },
  username: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
    gap: 3,
  },
  likeCount: {
    color: COLORS.textTertiary,
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.medium,
  },
  likeCountActive: {
    color: '#ff3b55',
  },
});
