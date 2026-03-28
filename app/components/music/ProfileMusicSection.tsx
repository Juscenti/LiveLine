// ============================================================
// ProfileMusicSection — Spotify strip under bio (own + public profiles)
// ============================================================
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import MusicBadge from '@/components/music/MusicBadge';
import type { MusicTrack } from '@/types';
import type { SpotifySyncIssue } from '@/stores/musicStore';

type Props = {
  track: MusicTrack | null;
  spotifyConnected: boolean;
  isSelf: boolean;
  /** Someone else’s profile — never show “Connect Spotify”, use friend-empty copy */
  viewingOthersProfile?: boolean;
  /**
   * When viewing someone else: from GET /music/:id/now-playing `meta.spotify_linked`.
   * null = not loaded yet — use neutral copy.
   */
  theirSpotifyLinked?: boolean | null;
  /** Own profile: last sync meta from server (reconnect vs Spotify dashboard allowlist) */
  spotifySelfHint?: SpotifySyncIssue;
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
  viewingOthersProfile = false,
  theirSpotifyLinked = null,
  spotifySelfHint = null,
  onPressConnect,
  friendCanInteract,
  onFriendInteract,
}: Props) {
  const showTrack = !!(track?.song && track?.source);

  const subtitle = showTrack
    ? track!.is_currently_playing
      ? 'Playing right now'
      : isSelf
        ? 'Last played on Spotify'
        : 'Last thing they played'
    : viewingOthersProfile
      ? theirSpotifyLinked === true
        ? 'No recent music showing yet. They may need to reconnect Spotify in Liveline (Settings → Music).'
        : theirSpotifyLinked === false
          ? 'They haven’t linked Spotify to Liveline yet.'
          : 'No recent music on their profile right now.'
      : spotifyConnected
        ? 'Nothing on the deck — play a song in Spotify'
        : 'Link Spotify so people see your vibe';

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
          <Text style={styles.sectionSub}>{subtitle}</Text>
        </View>
      </View>

      {!viewingOthersProfile && !spotifyConnected && onPressConnect ? (
        <Pressable
          onPress={onPressConnect}
          style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.linkBtnText}>Connect Spotify</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.spotify} />
        </Pressable>
      ) : null}

      {showTrack ? (
        <View style={styles.badgeWrap}>
          <MusicBadge track={track!} />
        </View>
      ) : null}

      {isSelf && spotifyConnected && spotifySelfHint === 'reconnect' ? (
        <Text style={styles.reconnectHint}>
          Spotify permissions may be out of date. Open Music settings, disconnect, and connect again to
          restore now playing.
        </Text>
      ) : null}

      {isSelf && spotifyConnected && spotifySelfHint === 'dashboard' ? (
        <Text style={styles.dashboardHint}>
          Spotify is blocking API access for your account (Developer Dashboard: add this Spotify user under User
          management, or the app needs extended quota). Reconnecting Liveline alone won’t fix it.
        </Text>
      ) : null}

      {isSelf && spotifyConnected && !spotifySelfHint ? (
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
  reconnectHint: {
    marginTop: SPACING.sm,
    fontSize: 11,
    color: COLORS.warning,
    lineHeight: 15,
  },
  dashboardHint: {
    marginTop: SPACING.sm,
    fontSize: 11,
    color: COLORS.textSecondary,
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
