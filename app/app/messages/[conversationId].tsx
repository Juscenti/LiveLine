// ============================================================
// app/messages/[conversationId].tsx — DM thread (placeholder)
// ============================================================
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONTS } from '@/constants';

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Chat</Text>
        <Text style={styles.meta} selectable>
          {conversationId}
        </Text>
        <Text style={styles.hint}>
          Full composer, realtime, and image uploads can plug in here — your DB + storage are ready.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: SPACING.base },
  header: { marginBottom: SPACING.md },
  back: { color: COLORS.accent, fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.semibold },
  body: { flex: 1, justifyContent: 'center', paddingBottom: 80 },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    marginBottom: SPACING.sm,
  },
  meta: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs, marginBottom: SPACING.lg },
  hint: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 },
});
