// ============================================================
// app/index.tsx — Auth redirect gate
// ============================================================
import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants';

/**
 * Session can exist without `user` if `/auth/me` failed (bad token, network).
 * Never send users into tabs with only a session — Profile and others assume `user`.
 */
function StaleSessionClearing() {
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    void logout();
  }, [logout]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
      <ActivityIndicator color={COLORS.accent} />
    </View>
  );
}

export default function Index() {
  const { session, user, isInitialized } = useAuthStore();

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!user) {
    return <StaleSessionClearing />;
  }

  return <Redirect href="/(tabs)/feed" />;
}
