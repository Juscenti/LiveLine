// ============================================================
// app/(tabs)/friends.tsx — Social hub: inbox + people + friends
// ============================================================
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { friendsApi, usersApi } from '@/services/api';
import {
  loadConversationList,
  getOrCreateDirectConversation,
  type ConversationListItem,
} from '@/services/conversations';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import { ConversationListRow, PersonRow, PillButton } from '@/components/shared';
import { formatApiError } from '@/utils/apiErrors';
import type { UserLike } from '@/utils/userDisplay';

dayjs.extend(relativeTime);

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FriendStatus =
  | 'none'
  | 'accepted'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'declined'
  | 'blocked';

type FriendStatusPayload = { status: FriendStatus; friendshipId: string | null };

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export default function FriendsTabScreen() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [convLoading, setConvLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<UserLike[]>([]);
  const [statusByUserId, setStatusByUserId] = useState<Record<string, FriendStatusPayload>>({});

  const [pendingOpen, setPendingOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const pendingTotal = requests.length + outgoing.length;

  const loadFriendsData = useCallback(async () => {
    setLoading(true);
    try {
      const [friendsRes, requestsRes, outgoingRes] = await Promise.all([
        friendsApi.getList(),
        friendsApi.getRequests(),
        friendsApi.getOutgoing(),
      ]);

      setFriends(friendsRes.data.data ?? friendsRes.data ?? []);
      setRequests(requestsRes.data.data ?? requestsRes.data ?? []);
      setOutgoing(outgoingRes.data.data ?? outgoingRes.data ?? []);
    } catch (e: unknown) {
      Alert.alert('Failed to load', formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    setConvLoading(true);
    try {
      const rows = await loadConversationList();
      setConversations(rows);
    } finally {
      setConvLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFriendsData();
  }, [loadFriendsData]);

  useFocusEffect(
    useCallback(() => {
      void loadConversations();
    }, [loadConversations]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadFriendsData(), loadConversations()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadFriendsData, loadConversations]);

  const accept = async (friendshipId: string) => {
    await friendsApi.acceptRequest(friendshipId);
    await loadFriendsData();
  };

  const decline = async (friendshipId: string) => {
    await friendsApi.declineRequest(friendshipId);
    await loadFriendsData();
  };

  const remove = async (userId: string) => {
    await friendsApi.remove(userId);
    await loadFriendsData();
  };

  const sendRequest = async (userId: string) => {
    try {
      await friendsApi.sendRequest(userId);
    } catch (e: unknown) {
      Alert.alert('Cannot send request', formatApiError(e));
    } finally {
      await loadFriendsData();
    }
  };

  const openDm = useCallback(async (otherUserId: string) => {
    const cid = await getOrCreateDirectConversation(otherUserId);
    if (cid) router.push(`/messages/${cid}`);
    else Alert.alert('Cannot open chat', 'You can only message people you’re friends with.');
  }, []);

  const fetchStatuses = useCallback(async (users: UserLike[]) => {
    const ids = users.map((u) => u.id).filter((x): x is string => !!x).slice(0, 8);
    const next: Record<string, FriendStatusPayload> = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          const resp = await friendsApi.getStatus(id);
          const payload = resp.data.data ?? resp.data;
          next[id] = payload as FriendStatusPayload;
        } catch {
          next[id] = { status: 'none', friendshipId: null };
        }
      }),
    );
    setStatusByUserId(next);
  }, []);

  const search = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setStatusByUserId({});
      return;
    }

    setSearchLoading(true);
    try {
      const resp = await usersApi.search(q, 0);
      const results = (resp.data.data ?? resp.data ?? []) as UserLike[];
      const slice = results.slice(0, 10);
      setSearchResults(slice);
      await fetchStatuses(slice);
    } catch (e: unknown) {
      Alert.alert('Search failed', formatApiError(e));
    } finally {
      setSearchLoading(false);
    }
  }, [fetchStatuses, searchQuery]);

  const onSearchPress = useCallback(() => {
    void search();
  }, [search]);

  const togglePending = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPendingOpen((o) => !o);
  };

  const StatusActions = useCallback(
    ({ u }: { u: UserLike }) => {
      if (!u.id) return null;
      const uid = u.id;
      const st = statusByUserId[uid]?.status ?? 'none';

      if (st === 'accepted') {
        return (
          <View style={styles.actionStack}>
            <PillButton label="Message" onPress={() => void openDm(uid)} />
            <PillButton label="Remove" variant="outline" onPress={() => remove(uid)} />
          </View>
        );
      }

      if (st === 'pending_outgoing') {
        return <PillButton label="Request sent" variant="muted" disabled />;
      }

      if (st === 'pending_incoming') {
        const friendshipId = statusByUserId[uid]?.friendshipId ?? null;
        return (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PillButton label="Accept" onPress={() => friendshipId && accept(friendshipId)} disabled={!friendshipId} />
            <PillButton
              label="Decline"
              variant="outline"
              onPress={() => friendshipId && decline(friendshipId)}
              disabled={!friendshipId}
            />
          </View>
        );
      }

      if (st === 'blocked') {
        return <PillButton label="Blocked" variant="muted" disabled />;
      }

      return <PillButton label="Add" onPress={() => sendRequest(uid)} />;
    },
    [accept, decline, openDm, remove, sendRequest, statusByUserId],
  );

  const renderChatRow = (item: ConversationListItem) => {
    const time = item.last_at != null ? dayjs(item.last_at).fromNow() : '';
    return (
      <ConversationListRow
        user={item.other_user}
        preview={item.last_preview}
        time={time}
        onPress={() => router.push(`/messages/${item.id}`)}
      />
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>Social</Text>
          <Text style={styles.titleSub}>Chats, requests, and friends in one place</Text>
        </View>
        <TouchableOpacity style={styles.headerLink} onPress={() => router.push('/map')}>
          <Text style={styles.headerLinkText}>Live map</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.flex1}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
      >
        {/* Inbox */}
        <View style={styles.card}>
          <SectionHeader
            title="Inbox"
            subtitle="Recent conversations"
            right={
              convLoading ? <ActivityIndicator color={COLORS.accent} size="small" /> : null
            }
          />
          {convLoading && conversations.length === 0 ? (
            <View style={styles.padV}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : conversations.length === 0 ? (
            <Text style={styles.emptyInbox}>
              No messages yet. Add friends below, then tap Message or open a thread here.
            </Text>
          ) : (
            <View>{conversations.map((c) => <View key={c.id}>{renderChatRow(c)}</View>)}</View>
          )}
        </View>

        {/* Find */}
        <View style={styles.card}>
          <SectionHeader title="Find people" subtitle="Search by username" />
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Username…"
              placeholderTextColor={COLORS.textTertiary}
              autoCapitalize="none"
              onSubmitEditing={onSearchPress}
            />
            <TouchableOpacity style={styles.searchBtn} onPress={onSearchPress} disabled={searchLoading}>
              {searchLoading ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <Text style={styles.searchBtnText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>

          {searchResults.length === 0 && !searchLoading ? (
            <Text style={styles.hintMuted}>Try a username to send a friend request.</Text>
          ) : null}

          {searchResults.length > 0 ? (
            <View style={{ marginTop: SPACING.md }}>
              {searchResults.map((u) => (
                <PersonRow
                  key={u.id as string}
                  user={u}
                  onPress={() => router.push(`/profile/${u.id}`)}
                  trailing={<StatusActions u={u} />}
                />
              ))}
            </View>
          ) : null}
        </View>

        {/* Requests */}
        <TouchableOpacity style={styles.requestsBar} onPress={togglePending} activeOpacity={0.85}>
          <View style={{ flex: 1 }}>
            <Text style={styles.requestsTitle}>Friend requests</Text>
            <Text style={styles.requestsSub}>Incoming and sent</Text>
          </View>
          {pendingTotal > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingTotal > 99 ? '99+' : pendingTotal}</Text>
            </View>
          ) : null}
          <Text style={styles.chevron}>{pendingOpen ? '▼' : '▶'}</Text>
        </TouchableOpacity>

        {pendingOpen && (
          <View style={styles.requestsBody}>
            {loading ? (
              <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.md }} />
            ) : (
              <>
                <Text style={styles.miniHeading}>Incoming</Text>
                {requests.length === 0 ? (
                  <Text style={styles.emptySmall}>None</Text>
                ) : (
                  requests.map((r) => {
                    const requesterUser = r.requester;
                    const requesterId = r.requester_id ?? requesterUser?.id;
                    const user =
                      requesterUser && requesterUser.id
                        ? (requesterUser as UserLike)
                        : ({
                            id: requesterId,
                            username: 'unknown',
                            display_name: 'Unknown',
                          } as UserLike);
                    return (
                      <PersonRow
                        key={r.id}
                        user={user}
                        onPress={() => requesterId && router.push(`/profile/${requesterId}`)}
                        trailing={
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <PillButton label="Accept" onPress={() => accept(r.id)} />
                            <PillButton label="Decline" variant="outline" onPress={() => decline(r.id)} />
                          </View>
                        }
                      />
                    );
                  })
                )}

                <Text style={[styles.miniHeading, { marginTop: SPACING.lg }]}>Sent</Text>
                {outgoing.length === 0 ? (
                  <Text style={styles.emptySmall}>None</Text>
                ) : (
                  outgoing.map((r) => {
                    const addresseeUser = r.addressee;
                    const addresseeId = r.addressee_id ?? addresseeUser?.id;
                    const user =
                      addresseeUser && addresseeUser.id
                        ? (addresseeUser as UserLike)
                        : ({
                            id: addresseeId,
                            username: 'unknown',
                            display_name: 'Unknown',
                          } as UserLike);
                    return (
                      <PersonRow
                        key={r.id}
                        user={user}
                        onPress={() => addresseeId && router.push(`/profile/${addresseeId}`)}
                        trailing={
                          <PillButton label="Cancel" variant="outline" onPress={() => remove(r.addressee_id)} />
                        }
                      />
                    );
                  })
                )}
              </>
            )}
          </View>
        )}

        <SectionHeader title="Friends" subtitle={`${friends.length} connected`} />
        {loading && friends.length === 0 ? (
          <View style={styles.padV}>
            <ActivityIndicator color={COLORS.accent} />
          </View>
        ) : friends.length === 0 ? (
          <Text style={styles.emptyFriends}>No friends yet — find people above.</Text>
        ) : (
          friends.map((f) => {
            const friendUser = f.users ?? f.user ?? null;
            const friendId = f.friend_id ?? f.id;
            const user =
              friendUser && friendUser.id
                ? (friendUser as UserLike)
                : ({
                    id: friendId,
                    username: String(friendId),
                    display_name: 'Friend',
                  } as UserLike);
            return (
              <PersonRow
                key={String(friendId)}
                user={user}
                onPress={() => router.push(`/profile/${friendId}`)}
                trailing={
                  <View style={styles.actionStack}>
                    <PillButton label="Message" onPress={() => void openDm(String(friendId))} />
                    <PillButton label="Remove" variant="outline" onPress={() => remove(String(friendId))} />
                  </View>
                }
              />
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  flex1: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    marginBottom: SPACING.md,
  },
  title: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.xl },
  titleSub: {
    color: COLORS.textTertiary,
    fontSize: FONTS.sizes.xs,
    marginTop: 4,
    maxWidth: 260,
  },
  headerLink: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  headerLinkText: { color: COLORS.textSecondary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.xs },

  scrollContent: { paddingHorizontal: SPACING.base, paddingBottom: 120 },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.bold,
    fontSize: FONTS.sizes.md,
  },
  sectionSubtitle: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs, marginTop: 2 },

  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
    marginBottom: SPACING.md,
  },
  padV: { paddingVertical: SPACING.md, alignItems: 'center' },
  emptyInbox: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 },

  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.textPrimary,
  },
  searchBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    minWidth: 92,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },
  hintMuted: { color: COLORS.textTertiary, marginTop: SPACING.sm, fontSize: FONTS.sizes.sm },

  requestsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  requestsTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.md },
  requestsSub: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs, marginTop: 2 },
  requestsBody: { marginBottom: SPACING.lg, paddingLeft: SPACING.xs },
  miniHeading: {
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.semibold,
    fontSize: FONTS.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  emptySmall: { color: COLORS.textTertiary, fontSize: FONTS.sizes.sm, marginBottom: SPACING.sm },
  chevron: { color: COLORS.textTertiary, fontSize: 14, marginLeft: 8 },
  badge: {
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: FONTS.weights.bold },

  emptyFriends: { color: COLORS.textTertiary, marginBottom: SPACING.lg },

  /** Stack so Message + Remove stay on-screen on narrow devices */
  actionStack: { flexDirection: 'column', gap: 8, alignItems: 'stretch', minWidth: 108 },
});
