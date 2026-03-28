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

  // Session is restored from SecureStore; startup waits for /auth/me before isInitialized (see authStore).
  return <Redirect href="/(tabs)/feed" />;
}
