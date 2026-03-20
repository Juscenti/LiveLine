import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { friendsApi, usersApi } from '@/services/api';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';

type FriendStatus =
  | 'none'
  | 'accepted'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'declined'
  | 'blocked';

type FriendStatusPayload = { status: FriendStatus; friendshipId: string | null };
type AnyUser = { id: string; username: string; display_name?: string | null; profile_picture_url?: string | null };

export default function FriendsScreen() {
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<AnyUser[]>([]);
  const [statusByUserId, setStatusByUserId] = useState<Record<string, FriendStatusPayload>>({});

  const avatarInitial = useCallback((u: AnyUser) => (u.display_name ?? u.username ?? '?')[0]?.toUpperCase() ?? '?', []);

  const load = useCallback(async () => {
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
    } catch (e: any) {
      Alert.alert('Failed to load friends', e.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async (friendshipId: string) => {
    await friendsApi.acceptRequest(friendshipId);
    await load();
  };

  const decline = async (friendshipId: string) => {
    await friendsApi.declineRequest(friendshipId);
    await load();
  };

  const remove = async (userId: string) => {
    await friendsApi.remove(userId);
    await load();
  };

  const sendRequest = async (userId: string) => {
    try {
      await friendsApi.sendRequest(userId);
    } catch (e: any) {
      // If it's already pending/exists, backend returns 409.
      Alert.alert('Cannot send request', e?.response?.data?.error ?? e?.message ?? 'Unknown error');
    } finally {
      await load();
    }
  };

  const fetchStatuses = useCallback(async (users: AnyUser[]) => {
    const ids = users.map((u) => u.id).slice(0, 8);
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
      })
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
      const results = (resp.data.data ?? resp.data ?? []) as AnyUser[];
      setSearchResults(results.slice(0, 10));
      await fetchStatuses(results.slice(0, 10));
    } catch (e: any) {
      Alert.alert('Search failed', e.message ?? 'Unknown error');
    } finally {
      setSearchLoading(false);
    }
  }, [fetchStatuses, searchQuery]);

  const onSearchPress = useCallback(() => {
    void search();
  }, [search]);

  const StatusActions = useCallback(
    ({ u }: { u: AnyUser }) => {
      const st = statusByUserId[u.id]?.status ?? 'none';
      const friendshipId = statusByUserId[u.id]?.friendshipId ?? null;

      if (st === 'accepted') {
        return (
          <TouchableOpacity style={[styles.smallBtn, styles.smallBtnOutline]} onPress={() => remove(u.id)}>
            <Text style={styles.smallBtnOutlineText}>Remove</Text>
          </TouchableOpacity>
        );
      }

      if (st === 'pending_outgoing') {
        return (
          <View style={[styles.smallBtn, styles.smallBtnDisabled]}>
            <Text style={styles.smallBtnTextDisabled}>Request sent</Text>
          </View>
        );
      }

      if (st === 'pending_incoming') {
        return (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.smallBtn, styles.smallBtnPrimary]}
              onPress={() => friendshipId && accept(friendshipId)}
              disabled={!friendshipId}
            >
              <Text style={styles.smallBtnTextInverse}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.smallBtn, styles.smallBtnOutline]}
              onPress={() => friendshipId && decline(friendshipId)}
              disabled={!friendshipId}
            >
              <Text style={styles.smallBtnOutlineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        );
      }

      // none/declined/blocked => show add button unless blocked
      if (st === 'blocked') {
        return (
          <View style={[styles.smallBtn, styles.smallBtnDisabled]}>
            <Text style={styles.smallBtnTextDisabled}>Blocked</Text>
          </View>
        );
      }

      return (
        <TouchableOpacity style={[styles.smallBtn, styles.smallBtnPrimary]} onPress={() => sendRequest(u.id)}>
          <Text style={styles.smallBtnTextInverse}>Add</Text>
        </TouchableOpacity>
      );
    },
    [accept, decline, remove, sendRequest, statusByUserId]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Friends</Text>
        <View style={{ width: 48 }} />
      </View>

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
              />
              <TouchableOpacity style={styles.searchBtn} onPress={onSearchPress} disabled={searchLoading}>
                {searchLoading ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.searchBtnText}>Search</Text>}
              </TouchableOpacity>
            </View>

            {searchResults.length === 0 && !searchLoading ? (
              <Text style={styles.empty}>Search to add friends.</Text>
            ) : null}

            {searchResults.length > 0 ? (
              <View style={{ marginTop: SPACING.md }}>
                {searchResults.map((u) => (
                  <View key={u.id} style={styles.userRow}>
                    <View style={styles.avatarCircle}>
                      {u.profile_picture_url ? (
                        <Image source={{ uri: u.profile_picture_url }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarInitial}>{avatarInitial(u)}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {u.display_name ?? u.username}
                      </Text>
                      <Text style={styles.userHandle}>@{u.username}</Text>
                    </View>
                    <StatusActions u={u} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Requests</Text>
          {requests.length === 0 ? (
            <Text style={styles.empty}>No pending requests.</Text>
          ) : (
            requests.map((r) => (
              <View key={r.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{r.requester?.display_name ?? r.requester?.username ?? 'Unknown'}</Text>
                </View>
                <TouchableOpacity style={[styles.smallBtn, styles.smallBtnPrimary]} onPress={() => accept(r.id)}>
                  <Text style={styles.smallBtnTextInverse}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, styles.smallBtnOutline]} onPress={() => decline(r.id)}>
                  <Text style={styles.smallBtnOutlineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <Text style={[styles.sectionTitle, { marginTop: SPACING.lg }]}>Your friends</Text>
          {friends.length === 0 ? (
            <Text style={styles.empty}>No friends yet.</Text>
          ) : (
            friends.map((f) => {
              const friendUser = f.users ?? f.user ?? null;
              const friendId = f.friend_id ?? f.id;
              return (
                <View key={friendId} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {friendUser?.display_name ?? friendUser?.username ?? friendId}
                    </Text>
                  </View>
                  <TouchableOpacity style={[styles.smallBtn, styles.smallBtnOutline]} onPress={() => remove(friendId)}>
                    <Text style={styles.smallBtnOutlineText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          {outgoing.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: SPACING.lg }]}>Requests you sent</Text>
              {outgoing.map((r) => (
                <View key={r.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{r.addressee?.display_name ?? r.addressee?.username ?? r.addressee_id}</Text>
                  </View>
                  <TouchableOpacity style={[styles.smallBtn, styles.smallBtnOutline]} onPress={() => remove(r.addressee_id)}>
                    <Text style={styles.smallBtnOutlineText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.base, paddingBottom: SPACING.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 56 },
  backText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  title: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.lg },
  loading: { paddingVertical: SPACING.xl },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
    marginTop: SPACING.md,
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
  searchBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: SPACING.md },
  searchBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },
  empty: { color: COLORS.textTertiary, marginTop: SPACING.sm },
  userRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.bgElevated, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarInitial: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: 14 },
  userName: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold },
  userHandle: { color: COLORS.textTertiary, fontSize: FONTS.sizes.xs, marginTop: 2 },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.md, marginTop: SPACING.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  name: { color: COLORS.textPrimary, fontWeight: FONTS.weights.medium, flexShrink: 1 },
  smallBtn: { borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10, justifyContent: 'center', alignItems: 'center' },
  smallBtnPrimary: { backgroundColor: COLORS.accent },
  smallBtnOutline: { backgroundColor: COLORS.bgElevated, borderWidth: 1, borderColor: COLORS.border },
  smallBtnDisabled: { backgroundColor: COLORS.bgElevated, borderWidth: 1, borderColor: COLORS.borderSubtle },
  smallBtnTextInverse: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },
  smallBtnOutlineText: { color: COLORS.textSecondary, fontWeight: FONTS.weights.medium },
  smallBtnTextDisabled: { color: COLORS.textTertiary, fontWeight: FONTS.weights.medium },
});
