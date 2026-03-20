import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { COLORS, FONTS, RADIUS, SPACING } from '@/constants';
import MusicBadge from '@/components/music/MusicBadge';
import type { MapFriend, MusicTrack } from '@/types';

interface Props {
  friend: MapFriend;
  onClose: () => void;
}

export default function FriendMapSheet({ friend, onClose }: Props) {
  const fakeTrack: MusicTrack | null = friend.music_song
    ? {
        id: 'map',
        user_id: friend.user_id,
        song: friend.music_song,
        artist: friend.music_artist ?? '',
        album: null,
        cover_url: friend.music_cover_url,
        source: 'spotify',
        platform_track_id: null,
        track_url: null,
        duration_ms: null,
        is_currently_playing: true,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }
    : null;

  return (
    <View style={sheetStyles.sheet}>
      <View style={sheetStyles.handle} />

      <View style={sheetStyles.row}>
        <View style={sheetStyles.avatarBorder}>
          {friend.profile_picture_url ? (
            <Image source={{ uri: friend.profile_picture_url }} style={sheetStyles.avatar} />
          ) : (
            <View style={[sheetStyles.avatar, sheetStyles.avatarPlaceholder]}>
              <Text style={sheetStyles.avatarInitial}>
                {(friend.display_name ?? friend.username)[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sheetStyles.name}>{friend.display_name ?? friend.username}</Text>
          <Text style={sheetStyles.username}>@{friend.username}</Text>
          {friend.activity_status && <Text style={sheetStyles.status}>{friend.activity_status}</Text>}
        </View>
        <TouchableOpacity onPress={onClose}>
          <Text style={sheetStyles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      {fakeTrack && <MusicBadge track={fakeTrack} compact style={sheetStyles.music} />}

      <TouchableOpacity
        style={sheetStyles.profileBtn}
        onPress={() => {
          onClose();
          router.push(`/profile/${friend.user_id}`);
        }}
      >
        <Text style={sheetStyles.profileBtnText}>View profile</Text>
      </TouchableOpacity>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 90,
    left: SPACING.base,
    right: SPACING.base,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  avatarBorder: { borderWidth: 2, borderColor: COLORS.accent, borderRadius: 999 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: {
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.lg },
  name: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.base },
  username: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs },
  status: { color: COLORS.accent, fontSize: FONTS.sizes.xs, marginTop: 2 },
  closeBtn: { color: COLORS.textTertiary, fontSize: FONTS.sizes.lg },
  music: { marginBottom: SPACING.md },
  profileBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  profileBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },
});

