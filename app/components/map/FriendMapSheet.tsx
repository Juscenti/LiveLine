import { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { COLORS, FONTS, RADIUS, SPACING } from '@/constants';
import MusicBadge from '@/components/music/MusicBadge';
import { getOrCreateDirectConversation } from '@/services/conversations';
import type { MapFriend, MusicPlatform, MusicTrack } from '@/types';

interface Props {
  friend: MapFriend;
  onClose: () => void;
}

function normalizeMusicSource(raw: string | null | undefined): MusicPlatform {
  if (raw === 'apple_music' || raw === 'soundcloud' || raw === 'spotify') return raw;
  return 'spotify';
}

export default function FriendMapSheet({ friend, onClose }: Props) {
  const [msgLoading, setMsgLoading] = useState(false);

  const isNowPlaying =
    friend.music_is_currently_playing !== undefined
      ? friend.music_is_currently_playing
      : !!friend.music_song;

  const fakeTrack: MusicTrack | null = friend.music_song
    ? {
        id: 'map',
        user_id: friend.user_id,
        song: friend.music_song,
        artist: friend.music_artist ?? '',
        album: null,
        cover_url: friend.music_cover_url,
        source: normalizeMusicSource(friend.music_source ?? null),
        platform_track_id: null,
        track_url: null,
        duration_ms: null,
        is_currently_playing: isNowPlaying,
        updated_at: new Date().toISOString(),
      }
    : null;

  const bio = friend.bio?.trim();

  const openMessage = async () => {
    setMsgLoading(true);
    try {
      const convId = await getOrCreateDirectConversation(friend.user_id);
      if (convId) {
        onClose();
        router.push(`/messages/${convId}`);
      } else {
        Alert.alert('Could not open chat', 'You must be friends to message.');
      }
    } finally {
      setMsgLoading(false);
    }
  };

  return (
    <View style={sheetStyles.sheet} pointerEvents="box-none">
      <View style={sheetStyles.handle} />

      <ScrollView
        style={sheetStyles.scroll}
        contentContainerStyle={sheetStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
            {friend.activity_status ? (
              <Text style={sheetStyles.status}>{friend.activity_status}</Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={sheetStyles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {bio ? <Text style={sheetStyles.bio}>{bio}</Text> : null}

        {fakeTrack ? (
          <MusicBadge track={fakeTrack} style={sheetStyles.music} />
        ) : (
          <View style={sheetStyles.noMusic}>
            <Text style={sheetStyles.noMusicText}>No music to show yet</Text>
          </View>
        )}

        <TouchableOpacity
          style={sheetStyles.messageBtn}
          onPress={openMessage}
          disabled={msgLoading}
          activeOpacity={0.85}
        >
          {msgLoading ? (
            <ActivityIndicator color={COLORS.textInverse} />
          ) : (
            <Text style={sheetStyles.messageBtnText}>Message</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={sheetStyles.profileBtn}
          onPress={() => {
            onClose();
            router.push(`/profile/${friend.user_id}`);
          }}
          activeOpacity={0.85}
        >
          <Text style={sheetStyles.profileBtnText}>View full profile</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 90,
    left: SPACING.base,
    right: SPACING.base,
    maxHeight: '52%',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  scroll: { maxHeight: 420 },
  scrollContent: { paddingBottom: SPACING.xs },
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
    marginBottom: SPACING.sm,
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
  bio: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  music: { marginBottom: SPACING.md },
  noMusic: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noMusicText: { color: COLORS.textTertiary, fontSize: FONTS.sizes.sm, textAlign: 'center' },
  messageBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  messageBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  profileBtn: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  profileBtnText: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.sm },
});
