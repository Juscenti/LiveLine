// ============================================================
// UserNameBlock — display name + @handle (list & profile)
// ============================================================
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS, SPACING } from '@/constants';
import { formatUserHandle, getDisplayName, type UserLike } from '@/utils/userDisplay';

type Props = {
  user: UserLike;
  /** Default row: bold name + gray @handle */
  variant?: 'list' | 'profile';
};

export default function UserNameBlock({ user, variant = 'list' }: Props) {
  const name = getDisplayName(user);
  const handle = formatUserHandle(user.username ?? undefined);

  if (variant === 'profile') {
    return (
      <View style={styles.profileWrap}>
        <Text style={styles.profileName}>{name}</Text>
        {handle ? <Text style={styles.profileHandle}>{handle}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.listWrap}>
      <Text style={styles.listName} numberOfLines={1}>
        {name}
      </Text>
      {handle ? (
        <Text style={styles.listHandle} numberOfLines={1}>
          {handle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1, minWidth: 0 },
  listName: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.semibold,
    fontSize: FONTS.sizes.md,
  },
  listHandle: {
    color: COLORS.textTertiary,
    fontSize: FONTS.sizes.xs,
    marginTop: 2,
  },
  profileWrap: { gap: SPACING.xs },
  profileName: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
  },
  profileHandle: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
  },
});
