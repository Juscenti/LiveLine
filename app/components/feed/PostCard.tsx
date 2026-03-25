// ============================================================
// components/feed/PostCard.tsx — Masonry tile (Pinterest-style)
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
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
}

const MAX_TILE_HEIGHT_FACTOR = 6;
const MIN_TILE_HEIGHT_FACTOR = 0.52;

export default function PostCard({ post, width, onPress, shouldPlay = false }: Props) {
  const user = useAuthStore((s) => s.user);
  const deletePost = useFeedStore((s) => s.deletePost);
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

  // ── Video player (shared for dim-measurement + autoplay) ──────────────────
  // Created for every video post. When shouldPlay=false and a thumbnail exists,
  // the source is null so the player is a no-op.
  // When shouldPlay=true OR there is no thumbnail (need metadata for tile height),
  // the source is the media_url so the player can fire videoTrackChange.
  const isVideo = post.media_type === 'video';
  const videoSource = isVideo ? (post.media_url ?? null) : null;
  // Only activate the player when we actually need it
  const activeSource = isVideo && (shouldPlay || !showImage) ? videoSource : null;

  const videoPlayer = useVideoPlayer(activeSource, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // When shouldPlay changes, drive play/pause imperatively
  useEffect(() => {
    if (!isVideo || !activeSource) return;
    if (shouldPlay) {
      videoPlayer.play();
    } else {
      videoPlayer.pause();
    }
  }, [shouldPlay, isVideo, activeSource, videoPlayer]);

  // Measure aspect from video track metadata — used as LAST RESORT fallback.
  // DB dims (below) take priority because they come from orientation-corrected values
  // (camera.tsx swaps raw dims at record time; gallery picks are re-encoded by image picker).
  // videoTrackChange reports raw iOS stream dims and can be wrong for camera recordings.
  const [trackAspect, setTrackAspect] = useState<number | null>(null);
  useEffect(() => { setTrackAspect(null); }, [post.id]);

  useEventListener(videoPlayer, 'videoTrackChange', ({ videoTrack }) => {
    const size = videoTrack?.size;
    if (size && size.width > 0 && size.height > 0) {
      setTrackAspect((prev) => prev ?? normalizeAspectFromPixels(size.width, size.height));
    }
  });

  // ── Aspect for videos ────────────────────────────────────────────────────
  // Prefer DB dimensions first so camera-taken uploads use the same aspect as
  // they were recorded (backend extracts real upright dims). Only fall back
  // to decoded/track measurement when DB dims are missing.
  const aspect = (() => {
    if (isVideo) {
      const w = Number(post.media_width);
      const h = Number(post.media_height);
      const dbAspect = w > 0 && h > 0 ? normalizeAspectFromPixels(w, h) : null;

      // Measure from the actual decoded video. This is the closest thing to
      // "read the real format" at render time.
      const measuredAspect = trackAspect ?? decodedAspect;

      // If DB and measured disagree materially, prefer measured to avoid
      // rotation/metadata mismatches.
      if (dbAspect != null && measuredAspect != null) {
        const dist = Math.abs(Math.log(dbAspect / measuredAspect));
        if (dist > 0.12) return measuredAspect;
        return dbAspect;
      }

      if (measuredAspect != null) return measuredAspect;
      if (dbAspect != null) return dbAspect;
      return 9 / 16; // last resort (legacy / no dims)
    }
    return decodedAspect ?? getPostMediaAspectRatio(post);
  })();

  const naturalH = width / aspect;
  const imageHeight = Math.min(
    Math.max(naturalH, width * MIN_TILE_HEIGHT_FACTOR),
    width * MAX_TILE_HEIGHT_FACTOR,
  );

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
      <TouchableOpacity onPress={onPress} activeOpacity={0.92}>
        <View style={[styles.media, { height: imageHeight, width, borderRadius: FEED.tileRadius }]}>
          {/* Autoplay video — shown when shouldPlay is true and media_url is available */}
          {shouldPlay && isVideo && post.media_url ? (
            <VideoView
              player={videoPlayer}
              style={[styles.fill, { borderRadius: FEED.tileRadius }]}
              contentFit="cover"
              nativeControls={false}
            />
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
});
