// ============================================================
// components/feed/PostCard.tsx — Grid card in the feed
// ============================================================
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { COLORS, FONTS, RADIUS, SPACING } from '@/constants';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { FeedPost } from '@/types';

dayjs.extend(relativeTime);

interface Props {
  post: FeedPost;
  width: number;
  onPress: () => void;
}

export default function PostCard({ post, width, onPress }: Props) {
  return (
    <TouchableOpacity style={[styles.card, { width }]} onPress={onPress} activeOpacity={0.85}>
      {/* Media */}
      <View style={[styles.media, { height: width * 1.25 }]}>
        {post.thumbnail_url || post.media_type === 'image' ? (
          <Image
            source={{ uri: post.thumbnail_url ?? post.media_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.videoPlaceholder}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        )}

        {/* Video badge */}
        {post.media_type === 'video' && (
          <View style={styles.videoBadge}>
            <Text style={styles.videoBadgeText}>▶ {post.duration_sec?.toFixed(0)}s</Text>
          </View>
        )}

        {/* Expiry badge */}
        {post.expires_at && (
          <View style={styles.expiryBadge}>
            <Text style={styles.expiryText}>{dayjs(post.expires_at).fromNow(true)}</Text>
          </View>
        )}

        {/* Gradient overlay at bottom */}
        <View style={styles.gradient} />

        {/* Author chip */}
        <View style={styles.authorChip}>
          <View style={styles.authorDot} />
          <Text style={styles.authorName} numberOfLines={1}>
            {post.author?.display_name ?? post.author?.username}
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {post.caption ? (
          <Text style={styles.caption} numberOfLines={2}>{post.caption}</Text>
        ) : null}
        <View style={styles.stats}>
          <Text style={styles.stat}>❤️ {post.like_count}</Text>
          <Text style={styles.time}>{dayjs(post.created_at).fromNow()}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  media: { position: 'relative', backgroundColor: COLORS.bgElevated },
  videoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  playIcon: { fontSize: 32, color: COLORS.textSecondary },
  videoBadge: {
    position: 'absolute', top: SPACING.sm, left: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: RADIUS.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  videoBadgeText: { color: '#fff', fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.medium },
  expiryBadge: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm,
    backgroundColor: COLORS.accentMuted, borderRadius: RADIUS.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  expiryText: { color: COLORS.accent, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.medium },
  gradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
    // Simulated gradient with opacity
    backgroundColor: 'transparent',
  },
  authorChip: {
    position: 'absolute', bottom: SPACING.sm, left: SPACING.sm,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 3,
    maxWidth: '80%',
  },
  authorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  authorName: { color: '#fff', fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.medium },
  footer: { padding: SPACING.sm },
  caption: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 16, marginBottom: 4 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stat: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  time: { fontSize: FONTS.sizes.xs, color: COLORS.textTertiary },
});
