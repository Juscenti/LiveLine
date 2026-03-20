import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { COLORS, SPACING, FONTS } from '@/constants';
import { useAuthStore } from '@/stores/authStore';

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();

  const doLogout = async () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.cardBody}>
          Signed in as @{user?.username ?? 'unknown'}.
        </Text>

        <TouchableOpacity style={styles.rowBtn} onPress={() => router.push('/profile/edit')}>
          <Text style={styles.rowBtnText}>Edit profile</Text>
          <Text style={styles.rowBtnArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.rowBtn, styles.logoutBtn]} onPress={doLogout}>
          <Text style={[styles.rowBtnText, { color: COLORS.error }]}>Log out</Text>
          <Text style={[styles.rowBtnArrow, { color: COLORS.error }]}>↩</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notifications</Text>
        <Text style={styles.cardBody}>
          Push + advanced notification controls are coming next. For now, check the Notifications tab.
        </Text>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonText}>Coming soon</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Privacy</Text>
        <Text style={styles.cardBody}>
          Location + visibility controls will be added after the live map MVP.
        </Text>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonText}>Coming soon</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.base },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 56, marginBottom: SPACING.lg },
  backText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  title: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.lg },

  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
    marginBottom: SPACING.lg,
  },
  cardTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.md, marginBottom: 6 },
  cardBody: { color: COLORS.textTertiary, lineHeight: 20 },

  rowBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    borderRadius: 14,
    paddingHorizontal: SPACING.base,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowBtnText: { color: COLORS.textSecondary, fontWeight: FONTS.weights.semibold },
  rowBtnArrow: { color: COLORS.textTertiary, fontSize: 18 },

  logoutBtn: { marginTop: 12 },

  comingSoon: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    borderRadius: 999,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  comingSoonText: { color: COLORS.textTertiary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.xs },
});

