// ============================================================
// components/feed/PostCard.tsx — Masonry tile (Pinterest-style)
// ============================================================
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, FEED } from '@/constants';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { FeedPost } from '@/types';

dayjs.extend(relativeTime);

export function getPostMediaAspectRatio(post: Pick<FeedPost, 'media_width' | 'media_height'>): number {
  const w = post.media_width;
  const h = post.media_height;
  if (w != null && h != null && w > 0 && h > 0) return w / h;
  return FEED.fallbackAspect;
}

interface Props {
  post: FeedPost;
  width: number;
  onPress: () => void;
}

export default function PostCard({ post, width, onPress }: Props) {
  const aspect = getPostMediaAspectRatio(post);
  const imageHeight = width / aspect;

  const uri = post.thumbnail_url ?? post.media_url;
  const showImage = post.media_type === 'image' || !!post.thumbnail_url;

  const handleMenu = () => {
    Alert.alert('Post', 'More options coming soon.');
  };

  return (
    <View style={[styles.card, { width }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.92}>
        <View style={[styles.media, { height: imageHeight, width, borderRadius: FEED.tileRadius }]}>
          {showImage ? (
            <Image
              source={{ uri }}
              style={[styles.image, { borderRadius: FEED.tileRadius }]}
              resizeMode="cover"
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
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Post options"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textPrimary} />
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
