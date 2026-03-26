// ============================================================
// app/(tabs)/friends.tsx — Social inbox: friends strip, search, DMs
// ============================================================
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { friendsApi, usersApi } from '@/services/api';
import {
  loadConversationList,
  getOrCreateDirectConversation,
  sendImageToFriends,
  type ConversationListItem,
} from '@/services/conversations';
import { COLORS, FEED, FONTS, RADIUS, SPACING, TAB_BAR } from '@/constants';
import { useFriendsInboxStore } from '@/stores/friendsInboxStore';
import { ConversationListRow, PersonRow, PillButton } from '@/components/shared';
import { InboxBottomSheet } from '@/components/friends/InboxBottomSheet';
import { FriendQuickActionSheet } from '@/components/friends/FriendQuickActionSheet';
import UserAvatar from '@/components/shared/UserAvatar';
import { formatApiError } from '@/utils/apiErrors';
import type { UserLike } from '@/utils/userDisplay';
import { getDisplayName, formatUserHandle } from '@/utils/userDisplay';

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

type SheetType = 'none' | 'filter' | 'requests' | 'addFriends' | 'compose';

const STRIP = 84; // ~1.5× prior 56px avatars

const SHEET: Record<Exclude<SheetType, 'none'>, { height: number; title: string }> = {
  filter: { height: 0.32, title: 'Filter inbox' },
  requests: { height: 0.7, title: 'Requests' },
  addFriends: { height: 0.58, title: 'Find people' },
  compose: { height: 0.74, title: 'Send photo' },
};

export default function FriendsTabScreen() {
  const insets = useSafeAreaInsets();

  const friends = useFriendsInboxStore((s) => s.friends) as any[];
  const requests = useFriendsInboxStore((s) => s.requests) as any[];
  const outgoing = useFriendsInboxStore((s) => s.outgoing) as any[];
  const friendsLoading = useFriendsInboxStore((s) => s.loading);
  const fetchFriendsInbox = useFriendsInboxStore((s) => s.fetch);

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [convLoading, setConvLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<UserLike[]>([]);
  const [statusByUserId, setStatusByUserId] = useState<Record<string, FriendStatusPayload>>({});

  const [refreshing, setRefreshing] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKind, setSheetKind] = useState<SheetType>('none');
  const [inboxFilterUnread, setInboxFilterUnread] = useState(false);

  const [composeUri, setComposeUri] = useState<string | null>(null);
  const [composeMime, setComposeMime] = useState('image/jpeg');
  const [selectedSendIds, setSelectedSendIds] = useState<Set<string>>(new Set());
  const [composeSending, setComposeSending] = useState(false);

  const [quickFriend, setQuickFriend] = useState<UserLike | null>(null);

  const pendingTotal = requests.length + outgoing.length;

  const scrollBottomPad = TAB_BAR.height + TAB_BAR.bottomGap + insets.bottom + 20;

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
    void fetchFriendsInbox();
  }, [fetchFriendsInbox]);

  // Preload the conversation list right away so switching to the Friends tab
  // doesn't wait for network calls; the UI will show its loading state if needed.
  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useFocusEffect(
    useCallback(() => {
      void loadConversations();
    }, [loadConversations]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchFriendsInbox({ withSpinner: true }), loadConversations()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchFriendsInbox, loadConversations]);

  const openSheet = useCallback((k: SheetType) => {
    setSheetKind(k);
    setSheetOpen(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setSheetOpen(false);
    setSheetKind('none');
    setComposeUri(null);
    setSelectedSendIds(new Set());
  }, []);

  const accept = async (friendshipId: string) => {
    try {
      await friendsApi.acceptRequest(friendshipId);
      await fetchFriendsInbox({ withSpinner: true });
    } catch (e: unknown) {
      Alert.alert('Could not accept', formatApiError(e));
    }
  };

  const decline = async (friendshipId: string) => {
    try {
      await friendsApi.declineRequest(friendshipId);
      await fetchFriendsInbox({ withSpinner: true });
    } catch (e: unknown) {
      Alert.alert('Could not decline', formatApiError(e));
    }
  };

  const remove = async (userId: string) => {
    if (!userId) {
      Alert.alert('Invalid request', 'Missing friend id.');
      return;
    }
    try {
      await friendsApi.remove(userId);
      await fetchFriendsInbox({ withSpinner: true });
    } catch (e: unknown) {
      Alert.alert('Could not remove', formatApiError(e));
    }
  };

  const sendRequest = async (userId: string) => {
    try {
      await friendsApi.sendRequest(userId);
    } catch (e: unknown) {
      Alert.alert('Cannot send request', formatApiError(e));
    } finally {
      await fetchFriendsInbox({ withSpinner: true });
    }
  };

  const openDm = useCallback(async (otherUserId: string) => {
    const r = await getOrCreateDirectConversation(otherUserId);
    if (r.ok) router.push(`/messages/${r.conversationId}`);
    else Alert.alert('Cannot open chat', r.message);
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

  const searchPeople = useCallback(async () => {
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

  const onPickImageToSend = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to send an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    setComposeUri(a.uri);
    setComposeMime(a.mimeType ?? 'image/jpeg');
    setSelectedSendIds(new Set());
    openSheet('compose');
  }, [openSheet]);

  const toggleSendSelect = useCallback((userId: string) => {
    setSelectedSendIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const onSendImageToFriends = useCallback(async () => {
    if (!composeUri) return;
    const ids = [...selectedSendIds];
    if (ids.length === 0) {
      Alert.alert('Select friends', 'Choose at least one friend to send to.');
      return;
    }
    setComposeSending(true);
    try {
      const results = await sendImageToFriends(ids, composeUri, composeMime);
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) {
        Alert.alert('Sent', `Photo sent to ${results.length} chat${results.length === 1 ? '' : 's'}.`);
        handleSheetClosed();
        await loadConversations();
      } else {
        Alert.alert(
          'Partially sent',
          `${results.length - failed.length} sent, ${failed.length} failed. Check your connection and try again.`,
        );
        await loadConversations();
      }
    } catch (e: unknown) {
      Alert.alert('Send failed', formatApiError(e));
    } finally {
      setComposeSending(false);
    }
  }, [composeMime, composeUri, selectedSendIds, handleSheetClosed, loadConversations]);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let rows = conversations;
    if (q) {
      rows = rows.filter((c) => {
        const name = getDisplayName(c.other_user).toLowerCase();
        const un = (c.other_user.username || '').toLowerCase();
        const prev = (c.last_preview || '').toLowerCase();
        return name.includes(q) || un.includes(q) || prev.includes(q);
      });
    }
    if (inboxFilterUnread) {
      // Reserved for unread / receipts — same as all until backend exposes read state.
      return rows;
    }
    return rows;
  }, [conversations, searchQuery, inboxFilterUnread]);

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

  const friendsForStrip = useMemo(() => {
    return friends
      .map((f) => {
        const friendUser = f.users ?? f.user ?? null;
        const friendUserId =
          f.friend_id != null ? String(f.friend_id) : friendUser?.id ? String(friendUser.id) : null;
        if (!friendUserId) return null;
        const user =
          friendUser && friendUser.id
            ? (friendUser as UserLike)
            : ({
                id: friendUserId,
                username: friendUserId,
                display_name: 'Friend',
              } as UserLike);
        return { key: friendUserId, user };
      })
      .filter(Boolean) as { key: string; user: UserLike }[];
  }, [friends]);

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

  const listHeader = (
    <View style={styles.headerBlock}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.headerCircleBtn}
          onPress={() => void onPickImageToSend()}
          accessibilityLabel="Send a photo to friends"
        >
          <Ionicons name="add" size={26} color={COLORS.textInverse} />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripScroll}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.stripAdd}
          onPress={() => openSheet('addFriends')}
          accessibilityLabel="Add friends"
        >
          <Ionicons name="add" size={36} color={COLORS.textInverse} />
        </TouchableOpacity>
        {friendsLoading && friendsForStrip.length === 0 ? (
          <View style={styles.stripPending} accessibilityLabel="Loading friends">
            <ActivityIndicator color={COLORS.accent} />
          </View>
        ) : null}
        {friendsForStrip.map(({ key, user }) => (
          <TouchableOpacity
            key={key}
            style={styles.stripAvatarWrap}
            onPress={() => setQuickFriend(user)}
            accessibilityLabel={`${getDisplayName(user)} — actions`}
          >
            <UserAvatar user={user} size="xxl" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.searchPill}>
        <Ionicons name="search" size={18} color={COLORS.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search"
          placeholderTextColor={COLORS.textTertiary}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => void searchPeople()}
        />
      </View>

      <View style={styles.utilityRow}>
        <TouchableOpacity
          style={styles.utilityHit}
          onPress={() => openSheet('filter')}
          accessibilityLabel="Filter inbox"
        >
          <Ionicons name="options-outline" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.utilityHit}
          onPress={() => openSheet('requests')}
          accessibilityLabel="Friend requests"
        >
          <View>
            <Ionicons name="people-outline" size={22} color={COLORS.textPrimary} />
            {pendingTotal > 0 ? (
              <View style={styles.utilityBadge}>
                <Text style={styles.utilityBadgeText}>{pendingTotal > 99 ? '99+' : pendingTotal}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.messagesHeading}>Messages</Text>
      {convLoading && conversations.length === 0 ? (
        <View style={styles.padV}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : null}
    </View>
  );

  const sheetCfg = sheetKind !== 'none' ? SHEET[sheetKind] : SHEET.filter;

  const sheetBody: ReactNode = (() => {
    if (sheetKind === 'filter') {
      return (
        <ScrollView contentContainerStyle={styles.sheetPad} keyboardShouldPersistTaps="handled">
          <View style={styles.filterRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.filterLabel}>Unread only</Text>
              <Text style={styles.filterHint}>Coming soon</Text>
            </View>
            <Switch
              value={inboxFilterUnread}
              onValueChange={setInboxFilterUnread}
              disabled
              trackColor={{ false: COLORS.border, true: COLORS.accentDim }}
            />
          </View>
          <View style={styles.filterRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.filterLabel}>Online</Text>
              <Text style={styles.filterHint}>Coming soon</Text>
            </View>
            <Switch disabled value={false} trackColor={{ false: COLORS.border, true: COLORS.accentDim }} />
          </View>
        </ScrollView>
      );
    }

    if (sheetKind === 'requests') {
      return (
        <ScrollView contentContainerStyle={[styles.sheetPad, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
          {friendsLoading ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 24 }} />
          ) : (
            <>
              <Text style={styles.sheetSection}>Incoming</Text>
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

              <Text style={[styles.sheetSection, { marginTop: SPACING.lg }]}>Sent</Text>
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
                        <PillButton label="Cancel" variant="outline" onPress={() => remove(addresseeId ?? '')} />
                      }
                    />
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      );
    }

    if (sheetKind === 'addFriends') {
      return (
        <ScrollView contentContainerStyle={[styles.sheetPad, { paddingBottom: 32 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.searchPill}>
            <Ionicons name="search" size={18} color={COLORS.textTertiary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Username…"
              placeholderTextColor={COLORS.textTertiary}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => void searchPeople()}
            />
          </View>
          <TouchableOpacity style={styles.searchCta} onPress={() => void searchPeople()} disabled={searchLoading}>
            {searchLoading ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={styles.searchCtaText}>Search</Text>
            )}
          </TouchableOpacity>
          {searchResults.length === 0 && !searchLoading ? (
            <Text style={styles.hintMuted}>Search by username to add people.</Text>
          ) : null}
          {searchResults.map((u) => (
            <PersonRow
              key={u.id as string}
              user={u}
              onPress={() => router.push(`/profile/${u.id}`)}
              trailing={<StatusActions u={u} />}
            />
          ))}
        </ScrollView>
      );
    }

    if (sheetKind === 'compose' && composeUri) {
      return (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.sheetPad, { paddingBottom: 16 }]} keyboardShouldPersistTaps="handled">
            <Image source={{ uri: composeUri }} style={styles.composePreview} contentFit="cover" />
            <Text style={styles.composeHelp}>Choose who receives this photo (multi-select).</Text>
            {friendsForStrip.length === 0 ? (
              <Text style={styles.emptySmall}>No friends yet — add people from the + strip.</Text>
            ) : (
              friendsForStrip.map(({ key, user }) => {
                const on = selectedSendIds.has(user.id!);
                return (
                  <Pressable
                    key={key}
                    style={styles.composeRow}
                    onPress={() => toggleSendSelect(user.id!)}
                  >
                    <UserAvatar user={user} size="md" />
                    <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                      <Text style={styles.composeName}>{getDisplayName(user)}</Text>
                      <Text style={styles.composeHandle}>{formatUserHandle(user.username)}</Text>
                    </View>
                    <Ionicons
                      name={on ? 'checkmark-circle' : 'ellipse-outline'}
                      size={26}
                      color={on ? COLORS.accent : COLORS.textTertiary}
                    />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          <TouchableOpacity
            style={[styles.composeSend, composeSending && styles.composeSendDisabled]}
            onPress={() => void onSendImageToFriends()}
            disabled={composeSending || selectedSendIds.size === 0}
          >
            {composeSending ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={styles.composeSendText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  })();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <FlatList
        data={filteredConversations}
        keyExtractor={(c) => c.id}
        renderItem={renderChatRow}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          !convLoading && filteredConversations.length === 0 ? (
            <Text style={styles.emptyInbox}>
              {conversations.length === 0
                ? 'No messages yet — tap a friend above or add someone.'
                : 'No threads match your search.'}
            </Text>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: scrollBottomPad, paddingHorizontal: SPACING.base }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        keyboardShouldPersistTaps="handled"
      />

      <InboxBottomSheet
        open={sheetOpen}
        onClose={handleSheetClosed}
        title={sheetCfg.title}
        heightPercent={sheetCfg.height}
        accessibilityLabel={sheetCfg.title}
      >
        {sheetBody}
      </InboxBottomSheet>

      <FriendQuickActionSheet
        open={!!quickFriend}
        user={quickFriend}
        onClose={() => setQuickFriend(null)}
        onViewProfile={(userId) => {
          setQuickFriend(null);
          router.push(`/profile/${userId}`);
        }}
        onMessage={(userId) => {
          setQuickFriend(null);
          void openDm(userId);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: FEED.background },
  headerBlock: { marginBottom: SPACING.sm },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: SPACING.md,
  },
  headerCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripScroll: {
    alignItems: 'center',
    gap: 14,
    paddingBottom: SPACING.md,
  },
  stripAdd: {
    width: STRIP,
    height: STRIP,
    borderRadius: STRIP / 2,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stripAvatarWrap: {
    width: STRIP,
    height: STRIP,
    borderRadius: STRIP / 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stripPending: {
    width: STRIP,
    height: STRIP,
    borderRadius: STRIP / 2,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    marginBottom: SPACING.md,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
    paddingVertical: 8,
  },
  utilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingHorizontal: 4,
  },
  utilityHit: { padding: 10 },
  utilityBadge: {
    position: 'absolute',
    right: -6,
    top: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  utilityBadgeText: { color: '#fff', fontSize: 9, fontWeight: FONTS.weights.bold },
  messagesHeading: {
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.semibold,
    fontSize: FONTS.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.xs,
  },
  padV: { paddingVertical: SPACING.md, alignItems: 'center' },
  emptyInbox: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
    lineHeight: 22,
    marginTop: SPACING.sm,
  },
  actionStack: { flexDirection: 'column', gap: 8, alignItems: 'stretch', minWidth: 108 },
  sheetPad: { paddingHorizontal: 16, paddingTop: 4 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderSubtle,
  },
  filterLabel: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold },
  filterHint: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs, marginTop: 2 },
  sheetSection: {
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.semibold,
    fontSize: FONTS.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  emptySmall: { color: COLORS.textTertiary, fontSize: FONTS.sizes.sm, marginBottom: SPACING.sm },
  searchCta: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  searchCtaText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },
  hintMuted: { color: COLORS.textTertiary, fontSize: FONTS.sizes.sm, marginBottom: SPACING.md },
  composePreview: {
    width: '100%',
    height: 200,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.bgCard,
  },
  composeHelp: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginBottom: SPACING.md },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderSubtle,
  },
  composeName: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold },
  composeHandle: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs },
  composeSend: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  composeSendDisabled: { opacity: 0.45 },
  composeSendText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.md },
});
