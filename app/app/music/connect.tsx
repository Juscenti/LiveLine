import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, ActivityIndicator, Image,
} from 'react-native';
import { router } from 'expo-router';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import { useMusicStore } from '@/stores/musicStore';
import { useAuthStore } from '@/stores/authStore';
import { musicApi, wakeBackend } from '@/services/api';
import * as Linking from 'expo-linking';

function formatRelative(ts: number | null): string {
  if (!ts) return 'never';
  const sec = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

export default function MusicConnectScreen() {
  const {
    connectedPlatforms,
    connectPlatform,
    disconnectPlatform,
    startPolling,
    stopPolling,
    syncNowPlaying,
    hydrateNowPlayingFromServer,
    spotifySyncIssue,
    nowPlaying,
    isSyncing,
    lastSyncAt,
    lastSyncError,
  } = useMusicStore();
  const userId = useAuthStore((s) => s.user?.id);
  const [loadingAuthUrl, setLoadingAuthUrl] = useState(false);
  const [debugCode, setDebugCode] = useState('');
  const [lastSpotifyState, setLastSpotifyState] = useState('');

  const isSpotifyConnected = useMemo(() => connectedPlatforms.includes('spotify'), [connectedPlatforms]);
  const isAppleConnected = useMemo(() => connectedPlatforms.includes('apple_music'), [connectedPlatforms]);

  // Pull whatever's already in the DB so the user sees something even if a poll just rate-limited.
  useEffect(() => {
    if (!userId || !isSpotifyConnected) return;
    void hydrateNowPlayingFromServer(userId);
  }, [userId, isSpotifyConnected, hydrateNowPlayingFromServer]);

  const handleRefresh = async () => {
    if (!isSpotifyConnected) return;
    // Cold-start the Railway backend; harmless if already warm.
    await wakeBackend();
    await syncNowPlaying();
    if (userId) await hydrateNowPlayingFromServer(userId);
  };

  const openSpotifyAuthLink = async () => {
    setLoadingAuthUrl(true);
    try {
      const redirectUri = Linking.createURL('/music/callback/spotify');
      console.log('[Spotify] redirect URI:', redirectUri);
      const resp = await musicApi.getSpotifyAuthUrl(redirectUri);
      const payload = resp.data.data ?? resp.data;
      if (!payload?.url) throw new Error('Missing auth url from backend.');
      if (typeof payload.state === 'string') setLastSpotifyState(payload.state);
      await Linking.openURL(payload.url);
    } catch (e: any) {
      Alert.alert('Spotify link unavailable', e?.response?.data?.error ?? e?.message ?? 'Unknown error');
    } finally {
      setLoadingAuthUrl(false);
    }
  };

  const openAppleAuthLink = async () => {
    setLoadingAuthUrl(true);
    try {
      const resp = await musicApi.getAppleMusicAuthUrl();
      const payload = resp.data.data ?? resp.data;
      if (!payload?.url) throw new Error('Missing auth url from backend.');
      await Linking.openURL(payload.url);
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
      startPolling();
      await syncNowPlaying();
      Alert.alert('Connected', 'Spotify connection saved.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/profile') },
      ]);
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

      {isSpotifyConnected && spotifySyncIssue === 'reconnect' ? (
        <View style={styles.reconnectBanner}>
          <Text style={styles.reconnectBannerText}>
            Spotify needs fresh permissions. Disconnect below, then connect again (you’ll see Spotify’s consent
            screen).
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Spotify</Text>
        <Text style={styles.sectionBody}>Opens Spotify auth in your browser and stores your connection.</Text>

        {isSpotifyConnected ? (
          <View style={styles.nowPlayingBox}>
            {nowPlaying?.song ? (
              <View style={styles.nowPlayingRow}>
                {nowPlaying.cover_url ? (
                  <Image source={{ uri: nowPlaying.cover_url }} style={styles.cover} />
                ) : (
                  <View style={[styles.cover, styles.coverPlaceholder]} />
                )}
                <View style={styles.trackText}>
                  <Text style={styles.trackTitle} numberOfLines={1}>{nowPlaying.song}</Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>{nowPlaying.artist}</Text>
                  <Text style={styles.trackMeta}>
                    {nowPlaying.is_currently_playing ? 'Playing now' : 'Last played'} · synced {formatRelative(lastSyncAt)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.nowPlayingEmpty}>
                Nothing synced yet. Play a song in Spotify, then tap Refresh.
              </Text>
            )}

            {lastSyncError ? (
              <Text style={styles.errorText}>{lastSyncError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: COLORS.bgElevated, marginTop: SPACING.md }]}
              onPress={handleRefresh}
              disabled={isSyncing}
            >
              {isSyncing
                ? <ActivityIndicator color={COLORS.textPrimary} />
                : <Text style={styles.btnText}>Refresh now</Text>}
            </TouchableOpacity>
          </View>
        ) : null}

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
  reconnectBanner: {
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.35)',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  reconnectBannerText: { color: COLORS.warning, fontSize: FONTS.sizes.sm, lineHeight: 20 },
  nowPlayingBox: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  nowPlayingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  cover: { width: 56, height: 56, borderRadius: RADIUS.sm, backgroundColor: COLORS.bgCard },
  coverPlaceholder: { borderWidth: 1, borderColor: COLORS.border },
  trackText: { flex: 1, minWidth: 0 },
  trackTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.md },
  trackArtist: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginTop: 2 },
  trackMeta: { color: COLORS.textTertiary, fontSize: 11, marginTop: 4 },
  nowPlayingEmpty: { color: COLORS.textTertiary, fontSize: FONTS.sizes.sm, lineHeight: 20 },
  errorText: { color: COLORS.warning, fontSize: 12, lineHeight: 17, marginTop: SPACING.sm },
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

