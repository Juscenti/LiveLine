import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMusicStore } from '@/stores/musicStore';
import type { MusicPlatform } from '@/types';

export default function MusicCallbackScreen() {
  const { provider, code, token, state } = useLocalSearchParams<{
    provider: string;
    code?: string;
    token?: string;
    state?: string;
  }>();
  const { connectPlatform, startPolling, syncNowPlaying } = useMusicStore();
  const [status, setStatus] = useState<'connecting' | 'done'>('connecting');
  const hasRun = useRef(false); // ADD THIS

  useEffect(() => {
    if (!provider || !code) return;
    if (hasRun.current) return; // ADD THIS
    hasRun.current = true;      // ADD THIS

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

        const oauthState = typeof state === 'string' ? state : Array.isArray(state) ? state[0] : undefined;
        if (platform === 'spotify' && !oauthState) {
          throw new Error('Missing OAuth state in callback URL.');
        }

        await connectPlatform(platform, value, oauthState);
        startPolling();
        await syncNowPlaying();
        setStatus('done');
        router.replace('/(tabs)/profile');
      } catch (e: any) {
        Alert.alert('Music connect failed', e?.message ?? 'Unknown error');
        router.replace('/(tabs)/profile');
      }
    };

    void run();
  }, []);

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

