// ============================================================
// app/(auth)/login.tsx
// ============================================================
import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { formatApiError } from '@/utils/apiErrors';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';

export default function LoginScreen() {
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submitLock = useRef(false);

  const handleLogin = async () => {
    if (!email || !password) return;
    if (submitLock.current || isLoading) return;
    submitLock.current = true;
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/(tabs)/feed');
    } catch (e: unknown) {
      Alert.alert('Login failed', formatApiError(e));
    } finally {
      submitLock.current = false;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.wordmark}>liveline</Text>
        <Text style={styles.tagline}>be here now.</Text>
      </View>

      <View style={styles.form}>
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

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>{isLoading ? 'Signing in...' : 'Sign in'}</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/register">
            <Text style={styles.footerLink}>Sign up</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', padding: SPACING.xl },
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
