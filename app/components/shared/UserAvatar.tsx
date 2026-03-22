// ============================================================
// UserAvatar — consistent circles + initials across the app
// ============================================================
import { View, Text, Image, StyleSheet, type ImageStyle } from 'react-native';
import { COLORS, FONTS } from '@/constants';
import type { UserLike } from '@/utils/userDisplay';
import { getInitial } from '@/utils/userDisplay';

const SIZES = { sm: 32, md: 44, lg: 56, xl: 72, xxl: 84 } as const;

export type AvatarSize = keyof typeof SIZES;

type Props = {
  user: UserLike;
  size?: AvatarSize;
  /** Extra ring (e.g. profile hero) */
  bordered?: boolean;
};

export default function UserAvatar({ user, size = 'md', bordered }: Props) {
  const dim = SIZES[size];
  const radius = dim / 2;
  const uri = user.profile_picture_url?.trim();

  const inner = uri ? (
    <Image source={{ uri }} style={[styles.img, { width: dim, height: dim, borderRadius: radius }]} />
  ) : (
    <View style={[styles.placeholder, { width: dim, height: dim, borderRadius: radius }]}>
      <Text
        style={[
          styles.initial,
          {
            fontSize:
              size === 'sm'
                ? 13
                : size === 'md'
                  ? 15
                  : size === 'lg'
                    ? 18
                    : size === 'xl'
                      ? 22
                      : 26,
          },
        ]}
      >
        {getInitial(user)}
      </Text>
    </View>
  );

  if (bordered) {
    return (
      <View style={[styles.ring, { borderRadius: radius + 3, borderColor: COLORS.bg }]}>
        {inner}
      </View>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 3,
    overflow: 'hidden',
  },
  img: {} as ImageStyle,
  placeholder: {
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  initial: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.bold,
  },
});
