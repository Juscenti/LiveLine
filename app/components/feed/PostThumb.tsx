// ============================================================
// components/feed/PostThumb.tsx — Compact post thumbnail
// ============================================================
import { TouchableOpacity, Image, View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '@/constants';
import type { Post } from '@/types';

interface Props { post: Post; size: number; onPress: () => void; }

export default function PostThumb({ post, size, onPress }: Props) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ width: size, height: size }}>
      <View style={[styles.container, { width: size, height: size }]}>
        {post.thumbnail_url || post.media_type === 'image' ? (
          <Image
            source={{ uri: post.thumbnail_url ?? post.media_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
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
