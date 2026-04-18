import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, router } from 'expo-router';
import { useMusicStore } from '@/stores/musicStore';
import type { MusicPlatform } from '@/types';

const SPOTIFY_CALLBACK_CODE_KEY = 'spotify-oauth-callback-code';

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
    if (!provider || !code) {
      router.replace('/(tabs)/profile');
      return;
    }

    if (hasRun.current) return;
    hasRun.current = true;

    const run = async () => {
      let platform: MusicPlatform | null = null;

      try {
        if (provider.toLowerCase() === 'spotify') {
          const previousCode = await AsyncStorage.getItem(SPOTIFY_CALLBACK_CODE_KEY);
          if (previousCode === code) {
            // Prevent reusing the same authorization code after app reload
            router.replace('/(tabs)/profile');
            return;
          }
        }

        const p = provider.toLowerCase();
        platform =
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

        if (platform === 'spotify' && code) {
          await AsyncStorage.setItem(SPOTIFY_CALLBACK_CODE_KEY, code);
        }

        router.replace('/(tabs)/profile');
      } catch (e: any) {
        Alert.alert('Music connect failed', e?.message ?? 'Unknown error');

        if (platform === 'spotify' && code) {
          await AsyncStorage.setItem(SPOTIFY_CALLBACK_CODE_KEY, code);
        }

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

