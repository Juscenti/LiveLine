// ============================================================
// app/(auth)/register.tsx
// ============================================================
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { formatApiError } from '@/utils/apiErrors';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';

export default function RegisterScreen() {
  const { register, isLoading } = useAuthStore();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleRegister = async () => {
    if (!username || !email || !password) return Alert.alert('All fields are required.');
    if (password !== confirmPassword) return Alert.alert('Passwords do not match.');
    if (password.length < 8) return Alert.alert('Password must be at least 8 characters.');
    try {
      await register(email.trim().toLowerCase(), password, username.trim().toLowerCase());
      router.replace('/(tabs)/feed');
    } catch (e: unknown) {
      Alert.alert('Registration failed', formatApiError(e));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.wordmark}>liveline</Text>
          <Text style={styles.tagline}>join the moment.</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor={COLORS.textTertiary}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.textTertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={COLORS.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={COLORS.textTertiary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>{isLoading ? 'Creating account...' : 'Create account'}</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login">
              <Text style={styles.footerLink}>Sign in</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xl },
  header: { alignItems: 'center', marginBottom: SPACING.xxxl },
  wordmark: { fontSize: FONTS.sizes.display, fontWeight: FONTS.weights.black, color: COLORS.accent, letterSpacing: -2 },
  tagline: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, marginTop: SPACING.xs },
  form: { gap: SPACING.md },
  input: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.base },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.md },
  footerText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  footerLink: { color: COLORS.accent, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
});
