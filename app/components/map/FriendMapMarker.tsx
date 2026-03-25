// ============================================================
// components/map/FriendMapMarker.tsx
// ============================================================
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '@/constants';
import type { MapFriend } from '@/types';

interface Props { friend: MapFriend; selected: boolean; }

export default function FriendMapMarker({ friend, selected }: Props) {
  return (
    <View style={[styles.wrapper, selected && styles.wrapperSelected]}>
      <View style={[styles.bubble, selected && styles.bubbleSelected]}>
        {friend.profile_picture_url ? (
          <Image source={{ uri: friend.profile_picture_url }} style={styles.avatar} />
        ) : (
          <Text style={styles.initial}>
            {(friend.display_name ?? friend.username)[0].toUpperCase()}
          </Text>
        )}
        {friend.music_song && <View style={styles.musicDot} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  wrapperSelected: { transform: [{ scale: 1.1 }] },
  bubble: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.bgCard,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  bubbleSelected: { borderColor: COLORS.accent, borderWidth: 2.5 },
  avatar: { width: '100%', height: '100%' },
  initial: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.base },
  musicDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.spotify,
    borderWidth: 1, borderColor: COLORS.bgCard,
  },
});
