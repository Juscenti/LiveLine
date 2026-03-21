// ============================================================
// app/messages/[conversationId].tsx — DM thread (composer TBD)
// ============================================================
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadConversationPeer, type ConversationPeer } from '@/services/conversations';
import { COLORS, SPACING, FONTS } from '@/constants';
import { AppHeader, UserAvatar } from '@/components/shared';
import { getDisplayName, formatUserHandle } from '@/utils/userDisplay';

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const insets = useSafeAreaInsets();
  const [peer, setPeer] = useState<ConversationPeer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const p = await loadConversationPeer(conversationId);
      if (!cancelled) {
        setPeer(p);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const title = peer ? getDisplayName(peer) : 'Chat';
  const subtitle = peer ? formatUserHandle(peer.username) : undefined;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <AppHeader
        title={title}
        subtitle={subtitle}
        onBack={() => router.back()}
        right={
          peer ? (
            <TouchableOpacity onPress={() => router.push(`/profile/${peer.id}`)} hitSlop={12}>
              <UserAvatar user={peer} size="sm" />
            </TouchableOpacity>
          ) : null
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : !peer ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Could not load this conversation.</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.hint}>
            Messages will appear here. Full composer and media are coming next.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: SPACING.base },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  body: { flex: 1, paddingTop: SPACING.lg },
  muted: { color: COLORS.textTertiary, fontSize: FONTS.sizes.sm },
  hint: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 },
});
