// ============================================================
// FriendQuickActionSheet — banner + avatar, profile / message
// Uses the same bottom sheet shell as filter / requests.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { usersApi } from '@/services/api';
import UserAvatar from '@/components/shared/UserAvatar';
import { InboxBottomSheet } from '@/components/friends/InboxBottomSheet';
import { COLORS, FONTS, RADIUS, SPACING } from '@/constants';
import type { UserLike } from '@/utils/userDisplay';
import { formatUserHandle, getDisplayName } from '@/utils/userDisplay';

type ProfilePayload = UserLike & {
  banner_url?: string | null;
  bio?: string | null;
};

type Props = {
  open: boolean;
  user: UserLike | null;
  onClose: () => void;
  onViewProfile: (userId: string) => void;
  onMessage: (userId: string) => void;
};

const SHEET_HEIGHT = 0.5;
const BANNER_H = 120;

export function FriendQuickActionSheet({ open, user, onClose, onViewProfile, onMessage }: Props) {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);

  useEffect(() => {
    if (!open || !user?.id) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    usersApi
      .getProfile(user.id)
      .then((res) => {
        const body = res?.data as { data?: ProfilePayload } | undefined;
        const d = body?.data;
        if (!cancelled && d) setProfile(d);
        else if (!cancelled) setProfile(user as ProfilePayload);
      })
      .catch(() => {
        if (!cancelled) setProfile(user as ProfilePayload);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user?.id, user]);

  const display = profile ?? user;
  const uid = display?.id;
  const bannerUri = display?.banner_url?.trim();

  const title = useMemo(() => {
    if (!user) return 'Friend';
    return getDisplayName(display ?? user);
  }, [user, display]);

  if (!user) return null;

  return (
    <InboxBottomSheet
      open={open}
      onClose={onClose}
      title={title}
      heightPercent={SHEET_HEIGHT}
      accessibilityLabel="Friend actions"
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bannerBlock}>
          {bannerUri ? (
            <Image source={{ uri: bannerUri }} style={styles.bannerImg} contentFit="cover" />
          ) : (
            <View style={[styles.bannerImg, styles.bannerFallback]} />
          )}
          <View style={styles.bannerScrim} />
        </View>

        <View style={styles.content}>
          <View style={styles.avatarSlot}>
            <UserAvatar user={display!} size="xl" bordered />
          </View>

          <Text style={styles.handle} numberOfLines={1}>
            {formatUserHandle(display?.username)}
          </Text>

          <View style={styles.row}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => uid && onViewProfile(uid)}
              activeOpacity={0.9}
              disabled={!uid}
            >
              <Ionicons name="person-outline" size={20} color={COLORS.textInverse} />
              <Text style={styles.btnPrimaryText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => uid && onMessage(uid)}
              activeOpacity={0.9}
              disabled={!uid}
            >
              <Ionicons name="chatbubble-outline" size={20} color={COLORS.textPrimary} />
              <Text style={styles.btnGhostText}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </InboxBottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: SPACING.lg,
  },
  bannerBlock: {
    height: BANNER_H,
    width: '100%',
  },
  bannerImg: {
    width: '100%',
    height: BANNER_H,
    backgroundColor: COLORS.bgElevated,
  },
  bannerFallback: {
    backgroundColor: COLORS.bgElevated,
  },
  bannerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  content: {
    paddingHorizontal: SPACING.base,
    alignItems: 'center',
  },
  avatarSlot: {
    marginTop: -40,
    marginBottom: SPACING.sm,
  },
  handle: {
    color: COLORS.textTertiary,
    fontSize: FONTS.sizes.sm,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    width: '100%',
    justifyContent: 'center',
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
  },
  btnPrimaryText: {
    color: COLORS.textInverse,
    fontWeight: FONTS.weights.bold,
    fontSize: FONTS.sizes.base,
  },
  btnGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.bgElevated,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnGhostText: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.semibold,
    fontSize: FONTS.sizes.base,
  },
});
