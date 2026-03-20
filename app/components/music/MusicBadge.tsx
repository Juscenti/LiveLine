// ============================================================
// components/music/MusicBadge.tsx
// Shows currently/recently playing track
// ============================================================
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, FONTS, RADIUS, SPACING } from '@/constants';
import type { MusicTrack } from '@/types';

const PLATFORM_COLORS: Record<string, string> = {
  spotify: COLORS.spotify,
  apple_music: COLORS.appleMusic,
  soundcloud: COLORS.soundcloud,
};

const PLATFORM_ICONS: Record<string, string> = {
  spotify: '♫',
  apple_music: '♪',
  soundcloud: '☁',
};

interface Props {
  track: MusicTrack;
  style?: ViewStyle;
  compact?: boolean;
}

export default function MusicBadge({ track, style, compact = false }: Props) {
  const color = PLATFORM_COLORS[track.source] ?? COLORS.accent;

  return (
    <View style={[styles.container, { borderColor: color + '40' }, style]}>
      {/* Cover art */}
      {track.cover_url ? (
        <Image source={{ uri: track.cover_url }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={{ fontSize: 16 }}>🎵</Text>
        </View>
      )}

      {/* Track info */}
      <View style={styles.info}>
        <View style={styles.nowRow}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.nowText, { color }]}>
            {track.is_currently_playing ? 'Now playing' : 'Recently played'}
          </Text>
          <Text style={[styles.platform, { color }]}>{PLATFORM_ICONS[track.source]}</Text>
        </View>
        <Text style={styles.song} numberOfLines={1}>{track.song}</Text>
        {!compact && <Text style={styles.artist} numberOfLines={1}>{track.artist}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md,
    borderWidth: 1, padding: SPACING.sm,
  },
  cover: { width: 44, height: 44, borderRadius: RADIUS.sm },
  coverPlaceholder: { backgroundColor: COLORS.bgElevated, justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  nowText: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.medium },
  platform: { marginLeft: 'auto', fontSize: FONTS.sizes.sm },
  song: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  artist: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginTop: 1 },
});
