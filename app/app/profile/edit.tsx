import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
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
  const [bannerUri, setBannerUri] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name ?? '');
    setUsername(user.username ?? '');
    setBio(user.bio ?? '');
  }, [user]);

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!res.canceled && res.assets[0]) setAvatarUri(res.assets[0].uri);
  };

  const pickBanner = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!res.canceled && res.assets[0]) setBannerUri(res.assets[0].uri);
  };

  const save = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await usersApi.updateProfile({
        display_name: displayName || null,
        bio: bio || null,
        username: username || null,
      } as any);

      if (avatarUri) {
        const form = new FormData();
        form.append('avatar', {
          uri: avatarUri,
          type: 'image/jpeg',
          name: 'avatar.jpg',
        } as any);
        await usersApi.uploadAvatar(form);
      }

      if (bannerUri) {
        const form = new FormData();
        form.append('banner', {
          uri: bannerUri,
          type: 'image/jpeg',
          name: 'banner.jpg',
        } as any);
        await usersApi.uploadBanner(form);
      }

      await refreshUser();
      router.replace(`/profile/${user.id}`);
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit profile</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Avatar</Text>
        <TouchableOpacity style={styles.btn} onPress={pickAvatar}>
          <Text style={styles.btnText}>Choose image</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Banner</Text>
        <TouchableOpacity style={styles.btn} onPress={pickBanner}>
          <Text style={styles.btnText}>Choose image</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Display name</Text>
        <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor={COLORS.textTertiary} />
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Username</Text>
        <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="username" placeholderTextColor={COLORS.textTertiary} autoCapitalize="none" />
      </View>

      <View style={styles.block}>
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

      <TouchableOpacity style={[styles.saveBtn, loading && styles.saveBtnDisabled]} onPress={save} disabled={loading}>
        {loading ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.saveBtnText}>Save</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.base },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 56, marginBottom: SPACING.lg },
  backText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  title: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.lg },
  block: { marginBottom: SPACING.md },
  label: { color: COLORS.textSecondary, fontWeight: FONTS.weights.semibold, marginBottom: SPACING.xs },
  input: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    color: COLORS.textPrimary,
  },
  bioInput: { minHeight: 90, textAlignVertical: 'top' },
  btn: { backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  btnText: { color: COLORS.textPrimary, fontWeight: FONTS.weights.medium },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.lg },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },
});

