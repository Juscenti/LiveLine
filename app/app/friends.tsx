import { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { friendsApi } from '@/services/api';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';

type FriendRow = any;

export default function FriendsScreen() {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [requests, setRequests] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        friendsApi.getList(),
        friendsApi.getRequests(),
      ]);
      setFriends(friendsRes.data.data ?? friendsRes.data);
      setRequests(requestsRes.data.data ?? requestsRes.data);
    } catch (e: any) {
      Alert.alert('Failed to load friends', e.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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
          <Text style={styles.sectionTitle}>Requests</Text>
          {requests.length === 0 ? (
            <Text style={styles.empty}>No pending requests.</Text>
          ) : (
            requests.map((r) => (
              <View key={r.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{r.requester?.display_name ?? r.requester?.username ?? 'Unknown'}</Text>
                </View>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => accept(r.id)}>
                  <Text style={styles.acceptText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.declineBtn} onPress={() => decline(r.id)}>
                  <Text style={styles.declineText}>Decline</Text>
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
              return (
                <View key={f.friend_id ?? f.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {friendUser?.display_name ?? friendUser?.username ?? f.friend_id}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.removeBtn} onPress={() => remove(f.friend_id)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.base },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 56 },
  backText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  title: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.lg },
  loading: { paddingVertical: SPACING.xl },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.md, marginTop: SPACING.lg },
  empty: { color: COLORS.textTertiary, marginTop: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  name: { color: COLORS.textPrimary, fontWeight: FONTS.weights.medium, flexShrink: 1 },
  acceptBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  acceptText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },
  declineBtn: { backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  declineText: { color: COLORS.textSecondary, fontWeight: FONTS.weights.medium },
  removeBtn: { backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  removeText: { color: COLORS.textSecondary, fontWeight: FONTS.weights.medium },
});

