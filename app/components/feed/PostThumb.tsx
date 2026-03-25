// ============================================================
// components/feed/PostThumb.tsx — Compact post thumbnail
// ============================================================
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { COLORS, RADIUS } from '@/constants';
import type { Post } from '@/types';

interface Props {
  post: Post;
  /** Width of the tile (height follows `aspectRatio`). */
  size: number;
  onPress: () => void;
  /** Width / height. Default `1` (square). Use e.g. `4/5` for portrait tiles like the feed. */
  aspectRatio?: number;
}

export default function PostThumb({ post, size, onPress, aspectRatio = 1 }: Props) {
  // RN: aspectRatio is width ÷ height. Use explicit height — `aspectRatio` on TouchableOpacity
  // + absoluteFill children often lays out as 0 height on iOS/Android.
  const tileHeight = size / aspectRatio;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{ width: size, height: tileHeight }}
    >
      <View style={[styles.container, { width: size, height: tileHeight }]}>
        {post.thumbnail_url || post.media_type === 'image' ? (
          <Image
            source={{ uri: post.thumbnail_url ?? post.media_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={{ fontSize: size * 0.3 }}>▶</Text>
          </View>
        )}
        {post.media_type === 'video' && (
          <View style={styles.playBadge}><Text style={styles.playText}>▶</Text></View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: COLORS.bgElevated },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  playBadge: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 99, padding: 2,
  },
  playText: { color: '#fff', fontSize: 8 },
});
