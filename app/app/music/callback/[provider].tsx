import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMusicStore } from '@/stores/musicStore';
import type { MusicPlatform } from '@/types';

export default function MusicCallbackScreen() {
  const { provider, code, token } = useLocalSearchParams<{
    provider: string;
    code?: string;
    token?: string;
  }>();
  const { connectPlatform, startPolling } = useMusicStore();
  const [status, setStatus] = useState<'connecting' | 'done'>('connecting');

  useEffect(() => {
    if (!provider) return;

    const run = async () => {
      try {
        const p = provider.toLowerCase();
        const platform: MusicPlatform =
          p === 'spotify' ? 'spotify' :
          p === 'apple' || p === 'apple_music' ? 'apple_music' :
          p === 'soundcloud' ? 'soundcloud' :
          'spotify';

        const value = platform === 'spotify' ? code : token;
        if (!value) {
          throw new Error('Missing OAuth parameter (code/token) in callback URL.');
        }

        await connectPlatform(platform, value);
        if (platform === 'spotify') startPolling();
        setStatus('done');
        router.replace('/music/connect');
      } catch (e: any) {
        Alert.alert('Music connect failed', e?.message ?? 'Unknown error');
        router.replace('/music/connect');
      }
    };

    void run();
  }, [provider, code, token, connectPlatform]);

  return (
    <View style={styles.container}>
      {status === 'connecting' ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.text}>Connecting your music account...</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.text}>Done.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  text: { color: '#fff', marginTop: 12, textAlign: 'center' },
});

