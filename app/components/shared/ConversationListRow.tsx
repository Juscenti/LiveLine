// ============================================================
// ConversationListRow — chat list row (matches PersonRow rhythm)
// ============================================================
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONTS, SPACING } from '@/constants';
import { getDisplayName, type UserLike } from '@/utils/userDisplay';
import UserAvatar from './UserAvatar';

type Props = {
  user: UserLike;
  preview: string;
  time?: string;
  onPress: () => void;
};

export default function ConversationListRow({ user, preview, time, onPress }: Props) {
  const name = getDisplayName(user);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      <UserAvatar user={user} size="md" />
      <View style={styles.mid}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {time ? <Text style={styles.time}>{time}</Text> : null}
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {preview}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderSubtle,
  },
  mid: { flex: 1, minWidth: 0 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: {
    flex: 1,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.semibold,
    fontSize: FONTS.sizes.md,
  },
  time: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs },
  preview: { color: COLORS.textTertiary, fontSize: FONTS.sizes.sm, marginTop: 2 },
});
