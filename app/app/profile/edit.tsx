// ============================================================
// app/profile/edit.tsx
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usersApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuthStore();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarMime, setAvatarMime] = useState<string>('image/jpeg');

  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [bannerMime, setBannerMime] = useState<string>('image/jpeg');

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name ?? '');
    setUsername(user.username ?? '');
    setBio(user.bio ?? '');
  }, [user]);

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85,
      mediaTypes: ['images'],
    });
    if (!res.canceled && res.assets[0]) {
      setAvatarUri(res.assets[0].uri);
      if (res.assets[0].mimeType) setAvatarMime(res.assets[0].mimeType);
    }
  };

  const pickBanner = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85,
      mediaTypes: ['images'],
    });
    if (!res.canceled && res.assets[0]) {
      setBannerUri(res.assets[0].uri);
      if (res.assets[0].mimeType) setBannerMime(res.assets[0].mimeType);
    }
  };

  const bannerPreviewUri = bannerUri ?? user?.banner_url ?? null;
  const avatarPreviewUri = avatarUri ?? user?.profile_picture_url ?? null;

  const avatarInitial = useMemo(() => {
    const seed = displayName.trim() || username.trim() || 'U';
    return seed[0]?.toUpperCase() ?? 'U';
  }, [displayName, username]);

  const save = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const dn = displayName.trim();
      const un = username.trim();
      const bb = bio.trim();

      const requestError = (e: any) => {
        const status = e?.response?.status;
        const serverError = e?.response?.data?.error;
        return `${status ? `HTTP ${status}` : ''}${status ? ' — ' : ''}${serverError ?? e?.message ?? 'Unknown error'}`;
      };

      // Always send all three fields so that clearing a value (e.g. bio) actually persists.
      // Username must be non-empty (enforced server-side); display_name and bio can be blank.
      const payload: { display_name: string; bio: string; username?: string } = {
        display_name: dn,
        bio: bb,
      };
      if (un) payload.username = un;

      try {
        await usersApi.updateProfile(payload);
      } catch (e: any) {
        throw new Error(`Update profile failed: ${requestError(e)}`);
      }

      if (avatarUri) {
        const form = new FormData();
        const ext = avatarMime.includes('png') ? 'png' : avatarMime.includes('webp') ? 'webp' : 'jpg';
        form.append('avatar', {
          uri: avatarUri,
          type: avatarMime,
          name: `avatar.${ext}`,
        } as any);

        try {
          await usersApi.uploadAvatar(form);
        } catch (e: any) {
          throw new Error(`Avatar upload failed: ${requestError(e)}`);
        }
      }

      if (bannerUri) {
        const form = new FormData();
        const ext = bannerMime.includes('png') ? 'png' : bannerMime.includes('webp') ? 'webp' : 'jpg';
        form.append('banner', {
          uri: bannerUri,
          type: bannerMime,
          name: `banner.${ext}`,
        } as any);

        try {
          await usersApi.uploadBanner(form);
        } catch (e: any) {
          throw new Error(`Banner upload failed: ${requestError(e)}`);
        }
      }

      await refreshUser();
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const topPad = insets.top + SPACING.sm;

  return (
    <View style={styles.screen}>
      {/* Nav — not painted on the banner */}
      <View style={[styles.nav, { paddingTop: topPad, paddingBottom: SPACING.md }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.65 }]}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={26} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.navTitle}>Edit profile</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bannerWrap}>
          {bannerPreviewUri ? (
            <Image source={{ uri: bannerPreviewUri }} style={styles.banner} />
          ) : (
            <View style={[styles.banner, styles.bannerEmpty]} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)']}
            style={styles.bannerOverlay}
          />
          <Pressable
            style={({ pressed }) => [styles.bannerChip, pressed && { opacity: 0.85 }]}
            onPress={pickBanner}
          >
            <Ionicons name="image-outline" size={18} color={COLORS.textPrimary} />
            <Text style={styles.bannerChipText}>Change banner</Text>
          </Pressable>
        </View>

        <View style={styles.avatarBlock}>
          <View style={styles.avatarRing}>
            {avatarPreviewUri ? (
              <Image source={{ uri: avatarPreviewUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>{avatarInitial}</Text>
              </View>
            )}
          </View>
          <View style={styles.avatarMeta}>
            <Text style={styles.avatarLabel}>Profile photo</Text>
            <Pressable
              style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.75 }]}
              onPress={pickAvatar}
            >
              <Ionicons name="camera-outline" size={18} color={COLORS.accent} />
              <Text style={styles.outlineBtnText}>Update photo</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.form}>
          <View style={styles.card}>
            <Text style={styles.label}>Display name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              placeholderTextColor={COLORS.textTertiary}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor={COLORS.textTertiary}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="About you…"
              placeholderTextColor={COLORS.textTertiary}
              multiline
              maxLength={300}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
          onPress={save}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.textInverse} />
          ) : (
            <Text style={styles.saveBtnText}>Save changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.bold,
    fontSize: FONTS.sizes.md,
  },
  navSpacer: { width: 44 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.md,
  },
  bannerWrap: {
    height: 148,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.bgElevated,
    position: 'relative',
  },
  banner: { width: '100%', height: '100%' },
  bannerEmpty: { backgroundColor: COLORS.bgElevated },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerChip: {
    position: 'absolute',
    bottom: SPACING.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(20,20,20,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  bannerChipText: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.semibold,
    fontSize: FONTS.sizes.sm,
  },
  avatarBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -40,
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  avatarRing: {
    borderWidth: 3,
    borderColor: COLORS.bg,
    borderRadius: 999,
  },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: {
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.bold,
    fontSize: FONTS.sizes.xl,
  },
  avatarMeta: { flex: 1, gap: SPACING.sm, justifyContent: 'center' },
  avatarLabel: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0,255,148,0.08)',
  },
  outlineBtnText: {
    color: COLORS.accent,
    fontWeight: FONTS.weights.semibold,
    fontSize: FONTS.sizes.sm,
  },
  form: { gap: SPACING.md },
  card: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  label: {
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.semibold,
    fontSize: FONTS.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.bgElevated,
    borderColor: COLORS.borderSubtle,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
  },
  bioInput: { minHeight: 96, textAlignVertical: 'top' },
  saveBtn: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: {
    color: COLORS.textInverse,
    fontWeight: FONTS.weights.bold,
    fontSize: FONTS.sizes.base,
  },
});
