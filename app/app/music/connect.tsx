import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Linking, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import { useMusicStore } from '@/stores/musicStore';
import { musicApi } from '@/services/api';

export default function MusicConnectScreen() {
  const { connectedPlatforms, connectPlatform, disconnectPlatform, startPolling, stopPolling } = useMusicStore();
  const [loadingAuthUrl, setLoadingAuthUrl] = useState(false);
  const [debugCode, setDebugCode] = useState('');
  const [lastSpotifyState, setLastSpotifyState] = useState('');

  const isSpotifyConnected = useMemo(() => connectedPlatforms.includes('spotify'), [connectedPlatforms]);
  const isAppleConnected = useMemo(() => connectedPlatforms.includes('apple_music'), [connectedPlatforms]);

  const openSpotifyAuthLink = async () => {
    setLoadingAuthUrl(true);
    try {
      const { data } = await musicApi.getSpotifyAuthUrl();
      if (!data?.url) throw new Error('Missing auth url from backend.');
      if (typeof data.state === 'string') setLastSpotifyState(data.state);
      await Linking.openURL(data.url);
    } catch (e: any) {
      Alert.alert('Spotify link unavailable', e?.response?.data?.error ?? e?.message ?? 'Unknown error');
    } finally {
      setLoadingAuthUrl(false);
    }
  };

  const openAppleAuthLink = async () => {
    setLoadingAuthUrl(true);
    try {
      const { data } = await musicApi.getAppleMusicAuthUrl();
      if (!data?.url) throw new Error('Missing auth url from backend.');
      await Linking.openURL(data.url);
    } catch (e: any) {
      Alert.alert('Apple link unavailable', e?.response?.data?.error ?? e?.message ?? 'Unknown error');
    } finally {
      setLoadingAuthUrl(false);
    }
  };

  const tryDebugConnect = async () => {
    try {
      if (!debugCode.trim()) return Alert.alert('Missing code', 'Paste the Spotify authorization code from the redirect URL.');
      if (!lastSpotifyState) {
        return Alert.alert('Missing state', 'Tap “Connect Spotify” first so the app stores OAuth state, then paste the code.');
      }
      await connectPlatform('spotify', debugCode.trim(), lastSpotifyState);
      Alert.alert('Connected', 'Spotify connection saved.');
      // Start syncing if we have a connection.
      startPolling();
    } catch (e: any) {
      Alert.alert('Connect failed', e?.message ?? 'Unknown error');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Connect music</Text>
        <View style={{ width: 48 }} />
      </View>

      <Text style={styles.note}>Connect your music so Liveline can show what you’re listening to.</Text>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Spotify</Text>
        <Text style={styles.sectionBody}>Opens Spotify auth in your browser and stores your connection.</Text>
        {isSpotifyConnected ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: COLORS.bgElevated }]}
            onPress={async () => {
              await disconnectPlatform('spotify');
              stopPolling();
            }}
          >
            <Text style={styles.btnText}>Disconnect Spotify</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={openSpotifyAuthLink} disabled={loadingAuthUrl}>
            {loadingAuthUrl ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.btnText}>Connect Spotify</Text>}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Apple Music</Text>
        <Text style={styles.sectionBody}>OAuth URL is not implemented fully yet in this repo.</Text>
        {isAppleConnected ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: COLORS.bgElevated }]}
            onPress={async () => {
              await disconnectPlatform('apple_music');
              stopPolling();
            }}
          >
            <Text style={styles.btnText}>Disconnect Apple Music</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.bgElevated }]} onPress={openAppleAuthLink} disabled={loadingAuthUrl}>
            {loadingAuthUrl ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.btnText}>Connect Apple Music</Text>}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Connected</Text>
        {connectedPlatforms.length === 0 ? (
          <Text style={styles.empty}>No platforms connected.</Text>
        ) : (
          connectedPlatforms.map((p) => <Text key={p} style={styles.connectedItem}>• {p}</Text>)
        )}
      </View>

      <View style={styles.debugCard}>
        <Text style={styles.sectionTitle}>Debug (optional)</Text>
        <Text style={styles.sectionBody}>If you’re testing, paste the Spotify authorization code here to connect.</Text>
        <TextInput
          style={styles.input}
          value={debugCode}
          onChangeText={setDebugCode}
          placeholder="Paste Spotify authorization code"
          placeholderTextColor={COLORS.textTertiary}
          autoCapitalize="none"
        />
        <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.bgElevated }]} onPress={tryDebugConnect}>
          <Text style={styles.btnText}>Connect with code</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.bgElevated }]} onPress={() => router.back()}>
        <Text style={styles.btnText}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.base },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 56, marginBottom: SPACING.lg },
  backText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm },
  title: { color: COLORS.textPrimary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.lg },
  note: { color: COLORS.textTertiary, lineHeight: 20, marginBottom: SPACING.lg },
  sectionCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
    marginBottom: SPACING.md,
  },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.md, marginBottom: SPACING.sm },
  sectionBody: { color: COLORS.textTertiary, lineHeight: 20, marginBottom: SPACING.md },
  btn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', marginBottom: SPACING.sm },
  btnText: { color: COLORS.textInverse, fontWeight: FONTS.weights.bold },
  input: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  empty: { color: COLORS.textTertiary, marginBottom: SPACING.lg },
  connectedItem: { color: COLORS.textSecondary, marginBottom: 4 },
  debugCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.base,
    marginBottom: SPACING.md,
  },
});

