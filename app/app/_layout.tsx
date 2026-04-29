// ============================================================
// app/_layout.tsx — Root layout (Expo Router)
// ============================================================
import { useEffect } from 'react';
import { View, LogBox } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { usePrefsStore } from '@/stores/prefsStore';

if (__DEV__ && process.env.EXPO_PUBLIC_VERBOSE_NETWORK_LOGS !== 'true') {
  // Transient offline / emulator DNS noise while Supabase or API retries.
  // Set EXPO_PUBLIC_VERBOSE_NETWORK_LOGS=true to surface these in LogBox.
  LogBox.ignoreLogs(['Network request failed', 'AuthRetryableFetchError']);
}

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const hydratePrefs = usePrefsStore((s) => s.hydrate);

  useEffect(() => {
    void initialize();
    void hydratePrefs();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="post/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="messages/[conversationId]" />
          <Stack.Screen name="profile/[id]" />
          <Stack.Screen name="profile/edit" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="interests" />
          <Stack.Screen name="music/connect" options={{ presentation: 'modal' }} />
        </Stack>
      </View>
    </QueryClientProvider>
  );
}
