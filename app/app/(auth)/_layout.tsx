// ============================================================
// app/(auth)/_layout.tsx
// ============================================================
import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function AuthLayout() {
  const { session, isInitialized } = useAuthStore();

  if (isInitialized && session) {
    return <Redirect href="/(tabs)/feed" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
