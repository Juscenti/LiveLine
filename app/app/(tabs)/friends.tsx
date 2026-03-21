// ============================================================
// app/(tabs)/friends.tsx — Messages hub: Chats + Social (friends / requests)
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  FlatList,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { friendsApi, usersApi } from '@/services/api';
import { loadConversationList, type ConversationListItem } from '@/services/conversations';
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
type HubSegment = 'chats' | 'social';

export default function FriendsTabScreen() {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<HubSegment>('chats');

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
      const friendshipId = statusByUserId[uid]?.friendshipId ?? null;

      if (st === 'accepted') {
        return <PillButton label="Remove" variant="outline" onPress={() => remove(uid)} />;
      }

      if (st === 'pending_outgoing') {
        return <PillButton label="Request sent" variant="muted" disabled />;
      }

      if (st === 'pending_incoming') {
        return (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PillButton
              label="Accept"
              onPress={() => friendshipId && accept(friendshipId)}
              disabled={!friendshipId}
            />
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
    [accept, decline, remove, sendRequest, statusByUserId],
  );

  const renderChatRow = ({ item }: { item: ConversationListItem }) => {
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
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity style={styles.headerLink} onPress={() => router.push('/map')}>
          <Text style={styles.headerLinkText}>Live map</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segmentPill, segment === 'chats' && styles.segmentPillActive]}
          onPress={() => setSegment('chats')}
        >
          <Text style={[styles.segmentText, segment === 'chats' && styles.segmentTextActive]}>Chats</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentPill, segment === 'social' && styles.segmentPillActive]}
          onPress={() => setSegment('social')}
        >
          <Text style={[styles.segmentText, segment === 'social' && styles.segmentTextActive]}>
            Social
            {pendingTotal > 0 ? ` (${pendingTotal})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {segment === 'chats' ? (
        <View style={styles.flex1}>
          {convLoading ? (
            <View style={styles.centerPad}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : conversations.length === 0 ? (
            <View style={styles.emptyChats}>
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptySub}>Go to Social to find people and add friends — then open a conversation here.</Text>
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={renderChatRow}
              contentContainerStyle={styles.chatList}
              refreshing={convLoading}
              onRefresh={() => void loadConversations()}
            />
          )}
        </View>
      ) : (
        <ScrollView style={styles.flex1} contentContainerStyle={styles.socialScroll} keyboardShouldPersistTaps="handled">
          {loading && (
            <View style={styles.loading}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          )}

          {!loading && (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Find people</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search by username"
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
                  <Text style={styles.empty}>Search to add friends.</Text>
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

              <TouchableOpacity style={styles.pendingHeader} onPress={togglePending} activeOpacity={0.8}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingTitle}>Requests</Text>
                  <Text style={styles.pendingSub}>Incoming & sent</Text>
                </View>
                {pendingTotal > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{pendingTotal > 99 ? '99+' : pendingTotal}</Text>
                  </View>
                ) : null}
                <Text style={styles.chevron}>{pendingOpen ? '▼' : '▶'}</Text>
              </TouchableOpacity>

              {pendingOpen && (
                <View style={styles.pendingBody}>
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

                  <Text style={[styles.miniHeading, { marginTop: SPACING.md }]}>Sent</Text>
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
                          trailing={<PillButton label="Cancel" variant="outline" onPress={() => remove(r.addressee_id)} />}
                        />
                      );
                    })
                  )}
                </View>
              )}

              <Text style={styles.sectionTitle}>Friends</Text>
              {friends.length === 0 ? (
                <Text style={styles.empty}>No friends yet.</Text>
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
                      key={friendId}
                      user={user}
                      onPress={() => router.push(`/profile/${friendId}`)}
                      trailing={<PillButton label="Remove" variant="outline" onPress={() => remove(friendId)} />}
                    />
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  flex1: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    marginBottom: SPACING.sm,
  },
  title: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.xl },
  headerLink: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerLinkText: { color: COLORS.textSecondary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.xs },

  segmentRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.base,
    marginBottom: SPACING.md,
  },
  segmentPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  segmentPillActive: {
    backgroundColor: COLORS.accentMuted,
    borderColor: COLORS.accent,
  },
  segmentText: { color: COLORS.textSecondary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.sm },
  segmentTextActive: { color: COLORS.accent },

  chatList: { paddingHorizontal: SPACING.base, paddingBottom: 120 },

  centerPad: { paddingVertical: SPACING.xl, alignItems: 'center' },
  emptyChats: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xxl, alignItems: 'center' },
  emptyTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.lg, marginBottom: SPACING.sm },
  emptySub: { color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },

  socialScroll: { paddingHorizontal: SPACING.base, paddingBottom: 120 },

  loading: { paddingVertical: SPACING.md },

  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
    marginBottom: SPACING.md,
  },
  cardTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.md },

  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: SPACING.sm },
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

  empty: { color: COLORS.textTertiary, marginTop: SPACING.sm },
  emptySmall: { color: COLORS.textTertiary, fontSize: FONTS.sizes.sm, marginBottom: SPACING.sm },

  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  pendingTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.md },
  pendingSub: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs, marginTop: 2 },
  pendingBody: {
    marginBottom: SPACING.lg,
    paddingLeft: SPACING.xs,
  },
  miniHeading: { color: COLORS.textSecondary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
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

  sectionTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.md, marginTop: SPACING.md, marginBottom: SPACING.sm },
});
