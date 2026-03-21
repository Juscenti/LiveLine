// ============================================================
// PillButton — primary CTA, outline, muted (friend actions, search)
// ============================================================
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { COLORS, FONTS, RADIUS, SPACING } from '@/constants';

export type PillVariant = 'primary' | 'outline' | 'muted' | 'dangerOutline';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: PillVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export default function PillButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  textStyle,
}: Props) {
  const dim = disabled || loading;
  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'outline' && styles.outline,
        variant === 'muted' && styles.muted,
        variant === 'dangerOutline' && styles.dangerOutline,
        dim && styles.dimmed,
        style,
      ]}
      onPress={onPress}
      disabled={dim}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? COLORS.textInverse : COLORS.textSecondary} />
      ) : (
        <Text
          style={[
            styles.text,
            variant === 'primary' && styles.textInverse,
            (variant === 'outline' || variant === 'dangerOutline') && styles.textSecondary,
            variant === 'muted' && styles.textMuted,
            textStyle,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    minWidth: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primary: { backgroundColor: COLORS.accent },
  outline: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  muted: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  dangerOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dimmed: { opacity: 0.55 },
  text: { fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  textInverse: { color: COLORS.textInverse },
  textSecondary: { color: COLORS.textSecondary, fontWeight: FONTS.weights.semibold },
  textMuted: { color: COLORS.textTertiary, fontWeight: FONTS.weights.medium },
});
