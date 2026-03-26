// ============================================================
// ProfileMusicSection — Spotify strip under bio (own + public profiles)
// ============================================================
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import MusicBadge from '@/components/music/MusicBadge';
import type { MusicTrack } from '@/types';

type Props = {
  track: MusicTrack | null;
  spotifyConnected: boolean;
  isSelf: boolean;
  onPressConnect?: () => void;
  /** When a friend views an accepted profile — quick emoji nudge opens chat via callback */
  friendCanInteract?: boolean;
  onFriendInteract?: () => void;
};

const REACTIONS = ['🔥', '💚', '🎧'] as const;

export default function ProfileMusicSection({
  track,
  spotifyConnected,
  isSelf,
  onPressConnect,
  friendCanInteract,
  onFriendInteract,
}: Props) {
  const showTrack = !!(track?.song && track?.source);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <LinearGradient
          colors={['#1DB954', '#169c46']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconOrb}
        >
          <Ionicons name="musical-note" size={16} color="#fff" />
        </LinearGradient>
        <View style={styles.headerText}>
          <Text style={styles.sectionTitle}>On Spotify</Text>
          <Text style={styles.sectionSub}>
            {showTrack
              ? track!.is_currently_playing
                ? 'Playing right now'
                : isSelf
                  ? 'Last played on Spotify'
                  : 'Last thing they played'
              : spotifyConnected
                ? 'Nothing on the deck — play a song in Spotify'
                : 'Link Spotify so people see your vibe'}
          </Text>
        </View>
      </View>

      {!spotifyConnected && onPressConnect ? (
        <Pressable
          onPress={onPressConnect}
          style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.linkBtnText}>Connect Spotify</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.spotify} />
        </Pressable>
      ) : null}

      {spotifyConnected && showTrack ? (
        <View style={styles.badgeWrap}>
          <MusicBadge track={track!} />
        </View>
      ) : null}

      {isSelf && spotifyConnected ? (
        <Text style={styles.hint}>Friends can peep this on your profile and the map.</Text>
      ) : null}

      {friendCanInteract && showTrack && onFriendInteract ? (
        <View style={styles.reactRow}>
          <Text style={styles.reactLabel}>Send a vibe</Text>
          <View style={styles.emojiRow}>
            {REACTIONS.map((e) => (
              <Pressable
                key={e}
                onPress={onFriendInteract}
                style={({ pressed }) => [styles.emojiBubble, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.emoji}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(29,185,84,0.22)',
    backgroundColor: 'rgba(29,185,84,0.06)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  iconOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 0.2,
  },
  sectionSub: {
    color: COLORS.textTertiary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  linkBtnText: {
    color: COLORS.spotify,
    fontWeight: FONTS.weights.semibold,
    fontSize: FONTS.sizes.sm,
  },
  badgeWrap: { marginTop: SPACING.xs },
  hint: {
    marginTop: SPACING.sm,
    fontSize: 11,
    color: COLORS.textTertiary,
    lineHeight: 15,
  },
  reactRow: {
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  reactLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    fontWeight: FONTS.weights.medium,
  },
  emojiRow: { flexDirection: 'row', gap: SPACING.sm },
  emojiBubble: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emoji: { fontSize: 20 },
});
