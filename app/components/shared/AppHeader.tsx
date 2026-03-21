// ============================================================
// AppHeader — back + centered title + optional right (stack screens)
// ============================================================
import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING } from '@/constants';

type Props = {
  title: string;
  onBack: () => void;
  right?: ReactNode;
  /** Subtitle under title (e.g. @handle) */
  subtitle?: string;
};

export default function AppHeader({ title, onBack, right, subtitle }: Props) {
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.side} accessibilityRole="button">
        <Ionicons name="chevron-back" size={26} color={COLORS.textPrimary} />
      </TouchableOpacity>
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
    minHeight: 44,
  },
  side: { width: 40, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.sm },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
  },
  subtitle: {
    color: COLORS.textTertiary,
    fontSize: FONTS.sizes.xs,
    marginTop: 2,
  },
});
