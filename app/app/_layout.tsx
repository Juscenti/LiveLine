// ============================================================
// app/_layout.tsx — Root layout (Expo Router)
// ============================================================
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { wakeBackend } from '@/services/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
});

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    // Render can cold-start; wake it up first so auth/profile/feed calls don't timeout.
    (async () => {
      await wakeBackend();
      await initialize();
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="post/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="profile/[id]" />
          <Stack.Screen name="profile/edit" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="interests" />
          <Stack.Screen name="music/connect" options={{ presentation: 'modal' }} />
        </Stack>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
