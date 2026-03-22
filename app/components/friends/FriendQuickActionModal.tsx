// ============================================================
// FriendQuickActionModal — banner + avatar, profile / message
// ============================================================
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { usersApi } from '@/services/api';
import UserAvatar from '@/components/shared/UserAvatar';
import { COLORS, FONTS, RADIUS, SPACING } from '@/constants';
import type { UserLike } from '@/utils/userDisplay';
import { formatUserHandle, getDisplayName } from '@/utils/userDisplay';

type ProfilePayload = UserLike & {
  banner_url?: string | null;
  bio?: string | null;
};

type Props = {
  visible: boolean;
  user: UserLike | null;
  onClose: () => void;
  onViewProfile: (userId: string) => void;
  onMessage: (userId: string) => void;
};

export function FriendQuickActionModal({ visible, user, onClose, onViewProfile, onMessage }: Props) {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);

  useEffect(() => {
    if (!visible || !user?.id) {
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
  }, [visible, user?.id, user]);

  const display = profile ?? user;
  const uid = display?.id;
  const bannerUri = display?.banner_url?.trim();

  if (!user) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.dim} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={styles.card} accessibilityViewIsModal>
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

            <Text style={styles.name} numberOfLines={1}>
              {display ? getDisplayName(display) : '…'}
            </Text>
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
        </View>
      </View>
    </Modal>
  );
}

const BANNER_H = 112;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    zIndex: 2,
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
    paddingBottom: SPACING.lg,
    paddingTop: 0,
    alignItems: 'center',
  },
  avatarSlot: {
    marginTop: -40,
    marginBottom: SPACING.sm,
  },
  name: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    textAlign: 'center',
  },
  handle: {
    color: COLORS.textTertiary,
    fontSize: FONTS.sizes.sm,
    marginTop: 4,
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
