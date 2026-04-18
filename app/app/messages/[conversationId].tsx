// ============================================================
// app/messages/[conversationId].tsx — DM thread
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Ionicons } from '@expo/vector-icons';
import {
  loadConversationPeer,
  loadMessages,
  sendTextMessage,
  subscribeToConversationMessages,
  unsubscribeChannel,
  type ChatMessage,
  type ConversationPeer,
} from '@/services/conversations';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import { AppHeader, UserAvatar } from '@/components/shared';
import { getDisplayName, formatUserHandle } from '@/utils/userDisplay';
import { formatApiError } from '@/utils/apiErrors';

dayjs.extend(relativeTime);

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const insets = useSafeAreaInsets();
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const [peer, setPeer] = useState<ConversationPeer | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const mergeIncoming = useCallback((row: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === row.id)) return prev;
      return [...prev, row].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    });
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [p, rows] = await Promise.all([
        loadConversationPeer(conversationId),
        loadMessages(conversationId),
      ]);
      if (cancelled) return;
      setPeer(p);
      setMessages(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const ch = subscribeToConversationMessages(conversationId, mergeIncoming);
    return () => {
      void unsubscribeChannel(ch);
    };
  }, [conversationId, mergeIncoming]);

  const onSend = async () => {
    if (!conversationId || !draft.trim()) return;
    setSending(true);
    try {
      const msg = await sendTextMessage(conversationId, draft);
      if (!msg) {
        Alert.alert('Message failed', 'Could not send. Try again.');
        return;
      }
      mergeIncoming(msg);
      setDraft('');
    } catch (e: unknown) {
      Alert.alert('Message failed', formatApiError(e));
    } finally {
      setSending(false);
    }
  };

  const title = peer ? getDisplayName(peer) : 'Chat';
  const subtitle = peer ? formatUserHandle(peer.username) : undefined;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
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
        <>
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const mine = myId != null && item.sender_id === myId;
              const hasText = !!(item.body && item.body.trim());
              const hasImg = !!item.image_url;
              return (
                <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {hasImg ? (
                      <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : undefined]}>
                        [Image]
                      </Text>
                    ) : null}
                    {hasText ? (
                      <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : undefined]}>
                        {item.body}
                      </Text>
                    ) : null}
                    <Text style={[styles.time, mine && styles.timeMine]}>
                      {dayjs(item.created_at).format('h:mm A')}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyHint}>Say hi — no messages yet.</Text>
            }
          />

          <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={COLORS.textTertiary}
              multiline
              maxLength={4000}
              editable={!sending}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
              onPress={() => void onSend()}
              disabled={!draft.trim() || sending}
              hitSlop={8}
            >
              {sending ? (
                <ActivityIndicator color={COLORS.textInverse} size="small" />
              ) : (
                <Ionicons name="send" size={20} color={COLORS.textInverse} />
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: SPACING.base },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  muted: { color: COLORS.textTertiary, fontSize: FONTS.sizes.sm },
  listContent: { paddingVertical: SPACING.md, paddingBottom: SPACING.lg },
  emptyHint: { color: COLORS.textTertiary, textAlign: 'center', marginTop: SPACING.xl },
  bubbleRow: { marginBottom: SPACING.sm, flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  bubbleMine: { backgroundColor: COLORS.accent },
  bubbleTheirs: { backgroundColor: COLORS.bgElevated, borderWidth: 1, borderColor: COLORS.border },
  bubbleText: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, lineHeight: 22 },
  bubbleTextMine: { color: COLORS.textInverse },
  time: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs, marginTop: 4 },
  timeMine: { color: 'rgba(255,255,255,0.75)' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },
});
