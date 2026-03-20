import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { usersApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';

export default function EditProfileScreen() {
  const router = useRouter();
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

  const getImagePickerImagesMediaTypes = () => {
    const picker: any = ImagePicker;
    // Different expo-image-picker versions expose either `MediaType` or
    // `MediaTypeOptions`. Your current build doesn't have `MediaType`.
    return picker?.MediaType?.Images ?? picker?.MediaTypeOptions?.Images ?? null;
  };

  const pickAvatar = async () => {
    const Images = getImagePickerImagesMediaTypes();
    const options: any = { quality: 0.85 };
    if (Images) options.mediaTypes = Images;
    const res = await ImagePicker.launchImageLibraryAsync(options);
    if (!res.canceled && res.assets[0]) {
      setAvatarUri(res.assets[0].uri);
      if (res.assets[0].mimeType) setAvatarMime(res.assets[0].mimeType);
    }
  };

  const pickBanner = async () => {
    const Images = getImagePickerImagesMediaTypes();
    const options: any = { quality: 0.85 };
    if (Images) options.mediaTypes = Images;
    const res = await ImagePicker.launchImageLibraryAsync(options);
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
      // Backend zod schema treats fields as `optional` (undefined), not `null`.
      // Sending `null` causes HTTP 400 validation errors.
      const payload: { display_name?: string; bio?: string; username?: string } = {};
      const dn = displayName.trim();
      const un = username.trim();
      const bb = bio.trim();

      if (dn) payload.display_name = dn;
      if (un) payload.username = un;
      if (bb) payload.bio = bb;

      const requestError = (e: any) => {
        const status = e?.response?.status;
        const serverError = e?.response?.data?.error;
        return `${status ? `HTTP ${status}` : ''}${status ? ' — ' : ''}${serverError ?? e?.message ?? 'Unknown error'}`;
      };

      if (Object.keys(payload).length > 0) {
        try {
          await usersApi.updateProfile(payload);
        } catch (e: any) {
          throw new Error(`Update profile failed: ${requestError(e)}`);
        }
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
      router.replace(`/profile/${user.id}`);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Banner header */}
      <View style={styles.bannerContainer}>
        {bannerPreviewUri ? (
          <Image source={{ uri: bannerPreviewUri }} style={styles.banner} />
        ) : (
          <View style={[styles.banner, { backgroundColor: COLORS.bgElevated }]} />
        )}

        <View style={styles.topFade} />

        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit profile</Text>
          <View style={{ width: 48 }} />
        </View>
      </View>

      {/* Avatar + quick action */}
      <View style={styles.avatarRow}>
        <View style={styles.avatarOuter}>
          {avatarPreviewUri ? (
            <Image source={{ uri: avatarPreviewUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{avatarInitial}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.changeBtn} onPress={pickAvatar}>
          <Text style={styles.changeBtnText}>Change</Text>
        </TouchableOpacity>
      </View>

      {/* Banner change */}
      <TouchableOpacity style={styles.bannerEditBtn} onPress={pickBanner}>
        <Text style={styles.bannerEditBtnText}>Change banner</Text>
      </TouchableOpacity>

      {/* Form cards */}
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
          placeholder="Tell people what you're listening to..."
          placeholderTextColor={COLORS.textTertiary}
          multiline
          maxLength={300}
        />
      </View>

      <View style={styles.bottomPad} />

      <TouchableOpacity
        style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
        onPress={save}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.textInverse} />
        ) : (
          <Text style={styles.saveBtnText}>Save</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.base },

  bannerContainer: { height: 140, position: 'relative' },
  banner: { width: '100%', height: '100%' },
  topFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  header: {
    position: 'absolute',
    left: SPACING.base,
    right: SPACING.base,
    top: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  backText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  title: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.lg },

  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -36,
    paddingHorizontal: SPACING.base,
  },
  avatarOuter: {
    borderWidth: 3,
    borderColor: COLORS.bg,
    borderRadius: 999,
  },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarPlaceholder: { backgroundColor: COLORS.bgElevated, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.xl },

  changeBtn: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  changeBtnText: { color: COLORS.textPrimary, fontWeight: FONTS.weights.medium },

  bannerEditBtn: {
    marginTop: SPACING.sm,
    marginHorizontal: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  bannerEditBtnText: { color: COLORS.textSecondary, fontWeight: FONTS.weights.semibold },

  card: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },

  label: { color: COLORS.textSecondary, fontWeight: FONTS.weights.semibold, marginBottom: SPACING.xs },
  input: {
    backgroundColor: COLORS.bgElevated,
    borderColor: COLORS.borderSubtle,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    color: COLORS.textPrimary,
  },
  bioInput: { minHeight: 90, textAlignVertical: 'top' },
  bottomPad: { height: 18 },

  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.base,
    marginBottom: SPACING.xl,
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },
});

