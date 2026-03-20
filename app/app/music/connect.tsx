import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { router } from 'expo-router';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import { useMusicStore } from '@/stores/musicStore';

export default function MusicConnectScreen() {
  const { connectedPlatforms, connectPlatform } = useMusicStore();
  const [spotifyToken, setSpotifyToken] = useState('');

  const tryConnectSpotify = async () => {
    try {
      // MVP placeholder: you need to supply your OAuth token/code here.
      // Backend currently stores a placeholder connection and will not sync without real tokens.
      if (!spotifyToken.trim()) return Alert.alert('Missing token', 'Paste a Spotify auth code/token first.');
      await connectPlatform('spotify', spotifyToken.trim());
      Alert.alert('Connected', 'Spotify connection saved (MVP placeholder).');
    } catch (e: any) {
      Alert.alert('Connect failed', e.message ?? 'Unknown error');
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

      <Text style={styles.note}>
        This screen is MVP-first. OAuth flows are not wired in this repo yet. You can still test the backend by passing an arbitrary code/token.
      </Text>

      <Text style={styles.sectionTitle}>Spotify</Text>
      <TextInput
        style={styles.input}
        value={spotifyToken}
        onChangeText={setSpotifyToken}
        placeholder="Paste Spotify auth code/token (placeholder)"
        placeholderTextColor={COLORS.textTertiary}
        autoCapitalize="none"
      />
      <TouchableOpacity
        style={styles.btn}
        onPress={() => tryConnectSpotify()}
      >
        <Text style={styles.btnText}>Connect (placeholder)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.bgElevated }]} onPress={() => router.back()}>
        <Text style={styles.btnText}>Done</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Connected</Text>
      {connectedPlatforms.length === 0 ? (
        <Text style={styles.empty}>No platforms connected.</Text>
      ) : (
        connectedPlatforms.map((p) => (
          <Text key={p} style={styles.connectedItem}>• {p}</Text>
        ))
      )}
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
  sectionTitle: { color: COLORS.textPrimary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.md, marginBottom: SPACING.sm },
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
});

