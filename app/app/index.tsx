// ============================================================
// app/index.tsx — Auth redirect gate
// ============================================================
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants';

export default function Index() {
  const { session, isInitialized } = useAuthStore();

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

  // Session is enough to enter the app; profile loads via /auth/me retries + refreshUser.
  return <Redirect href="/(tabs)/feed" />;
}
