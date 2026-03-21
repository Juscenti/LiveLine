// ============================================================
// PersonRow — avatar + UserNameBlock + trailing actions
// ============================================================
import type { ReactNode } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '@/constants';
import type { UserLike } from '@/utils/userDisplay';
import UserAvatar from './UserAvatar';
import UserNameBlock from './UserNameBlock';

type Props = {
  user: UserLike;
  onPress?: () => void;
  trailing?: ReactNode;
  /** Show bottom border (lists) */
  bordered?: boolean;
};

export default function PersonRow({ user, onPress, trailing, bordered = true }: Props) {
  const content = (
    <>
      <UserAvatar user={user} size="md" />
      <UserNameBlock user={user} />
      {trailing != null ? <View style={styles.trailing}>{trailing}</View> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.row, bordered && styles.border]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.row, bordered && styles.border]}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderSubtle,
  },
  trailing: { flexShrink: 0 },
});
