// ============================================================
// app/settings.tsx — User settings (first slice: client + ready-backed)
// ============================================================
import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Switch,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { COLORS, SPACING, FONTS, RADIUS } from '@/constants';
import { useAuthStore } from '@/stores/authStore';
import { useMusicStore } from '@/stores/musicStore';
import { useMapStore } from '@/stores/mapStore';
import { usePrefsStore, type VideoAutoplay } from '@/stores/prefsStore';
import { usersApi } from '@/services/api';
import type { VisibilityLevel, MusicPlatform } from '@/types';

const SUPPORT_EMAIL = 'support@liveline.app';
const TERMS_URL = 'https://liveline.app/terms';
const PRIVACY_URL = 'https://liveline.app/privacy';
const RATE_URL = 'https://liveline.app/rate';

const VISIBILITY_OPTIONS: { value: VisibilityLevel; label: string }[] = [
  { value: 'public', label: 'public' },
  { value: 'friends', label: 'friends' },
  { value: 'private', label: 'private' },
];

const AUTOPLAY_OPTIONS: { value: VideoAutoplay; label: string }[] = [
  { value: 'always', label: 'always' },
  { value: 'wifi', label: 'wi-fi' },
  { value: 'never', label: 'never' },
];

const PLATFORM_LABELS: Record<MusicPlatform, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  soundcloud: 'SoundCloud',
};

// ── Section card ─────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

// ── Single settings row ──────────────────────────────────────
function Row({
  label,
  sublabel,
  right,
  onPress,
  showDivider,
  destructive,
  disabled,
}: {
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  showDivider?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const inner = (
    <View style={[styles.row, showDivider && styles.rowDivider]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, destructive && { color: COLORS.error }, disabled && { opacity: 0.5 }]}>
          {label}
        </Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
    </View>
  );
  if (onPress && !disabled) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

// ── Inline segmented selector ────────────────────────────────
function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.segmented, disabled && { opacity: 0.5 }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => !disabled && onChange(opt.value)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && !disabled && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, setUser, refreshUser } = useAuthStore();
  const session = useAuthStore((s) => s.session);

  const connectedPlatforms = useMusicStore((s) => s.connectedPlatforms);
  const disconnectPlatform = useMusicStore((s) => s.disconnectPlatform);
  const setMapVisibility = useMapStore((s) => s.setVisibility);

  const {
    haptics,
    reduceMotion,
    videoAutoplay,
    dataSaver,
    liveMapEnabled,
    setHaptics,
    setReduceMotion,
    setVideoAutoplay,
    setDataSaver,
    setLiveMapEnabled,
  } = usePrefsStore();

  const [savingVisibility, setSavingVisibility] = useState(false);
  const [savingMapToggle, setSavingMapToggle] = useState(false);
  const [disconnecting, setDisconnecting] = useState<MusicPlatform | null>(null);

  const visibility: VisibilityLevel = user?.default_location_visibility ?? 'friends';

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }, [logout]);

  const handleVisibilityChange = useCallback(
    async (next: VisibilityLevel) => {
      if (savingVisibility || next === visibility) return;
      setSavingVisibility(true);
      const prev = user;
      if (user) setUser({ ...user, default_location_visibility: next });
      try {
        await usersApi.updateProfile({ default_location_visibility: next });
        if (liveMapEnabled) {
          await setMapVisibility(next);
        }
        void refreshUser();
      } catch {
        if (prev) setUser(prev);
        Alert.alert("Couldn't update visibility", 'Please try again.');
      } finally {
        setSavingVisibility(false);
      }
    },
    [savingVisibility, visibility, user, setUser, liveMapEnabled, setMapVisibility, refreshUser],
  );

  const handleMapToggle = useCallback(
    async (next: boolean) => {
      if (savingMapToggle) return;
      setSavingMapToggle(true);
      const prev = liveMapEnabled;
      setLiveMapEnabled(next);
      try {
        await setMapVisibility(next ? visibility : 'private');
      } catch {
        setLiveMapEnabled(prev);
        Alert.alert("Couldn't update live map", 'Please try again.');
      } finally {
        setSavingMapToggle(false);
      }
    },
    [savingMapToggle, liveMapEnabled, setLiveMapEnabled, setMapVisibility, visibility],
  );

  const handleDisconnect = useCallback(
    (platform: MusicPlatform) => {
      Alert.alert(
        `Disconnect ${PLATFORM_LABELS[platform]}?`,
        'You can reconnect any time.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: async () => {
              setDisconnecting(platform);
              try {
                await disconnectPlatform(platform);
              } catch (e: any) {
                Alert.alert('Could not disconnect', e?.message ?? 'Try again.');
              } finally {
                setDisconnecting(null);
              }
            },
          },
        ],
      );
    },
    [disconnectPlatform],
  );

  const openLink = useCallback((url: string) => {
    void Linking.openURL(url).catch(() => {
      Alert.alert("Couldn't open link", url);
    });
  }, []);

  const appVersion = useMemo(() => {
    const cfg = Constants.expoConfig;
    const v = cfg?.version ?? '—';
    const build =
      (cfg?.ios as any)?.buildNumber ??
      (cfg?.android as any)?.versionCode ??
      null;
    return build ? `${v} (${build})` : v;
  }, []);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.title}>settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + SPACING.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Account ─────────────────────────────────────────── */}
        <Section title="account">
          <Row
            label="signed in as"
            right={
              <Text style={styles.rowValue}>
                {user?.username ? `@${user.username}` : '—'}
              </Text>
            }
            showDivider
          />
          <Row
            label="email"
            right={
              <Text style={styles.rowValue} numberOfLines={1}>
                {session?.user?.email ?? '—'}
              </Text>
            }
            showDivider
          />
          <Row
            label="edit profile"
            right={<Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />}
            onPress={() => router.push('/profile/edit')}
            showDivider
          />
          <Row
            label="manage music platforms"
            sublabel={
              connectedPlatforms.length > 0
                ? connectedPlatforms.map((p) => PLATFORM_LABELS[p]).join(', ')
                : 'none connected'
            }
            right={<Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />}
            onPress={() => router.push('/music/connect')}
            showDivider
          />
          {connectedPlatforms.map((platform) => (
            <Row
              key={platform}
              label={`disconnect ${PLATFORM_LABELS[platform]}`}
              right={
                disconnecting === platform ? (
                  <ActivityIndicator size="small" color={COLORS.textSecondary} />
                ) : (
                  <Ionicons name="close-circle-outline" size={18} color={COLORS.error} />
                )
              }
              onPress={() => handleDisconnect(platform)}
              showDivider
              disabled={disconnecting === platform}
            />
          ))}
          <Row
            label="log out"
            destructive
            right={<Ionicons name="log-out-outline" size={18} color={COLORS.error} />}
            onPress={handleLogout}
          />
        </Section>

        {/* Privacy ─────────────────────────────────────────── */}
        <Section title="privacy">
          <View style={styles.stack}>
            <Text style={styles.stackLabel}>default location visibility</Text>
            <Segmented<VisibilityLevel>
              value={visibility}
              options={VISIBILITY_OPTIONS}
              onChange={handleVisibilityChange}
              disabled={savingVisibility}
            />
            <Text style={styles.stackHint}>
              who can see you on the live map by default
            </Text>
          </View>
          <View style={styles.divider} />
          <Row
            label="show me on the live map"
            sublabel={liveMapEnabled ? 'currently sharing your location' : 'hidden from the map'}
            right={
              <Switch
                value={liveMapEnabled}
                onValueChange={handleMapToggle}
                disabled={savingMapToggle}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor={'#fff'}
                ios_backgroundColor={COLORS.border}
              />
            }
          />
        </Section>

        {/* Appearance ─────────────────────────────────────── */}
        <Section title="appearance">
          <Row
            label="haptic feedback"
            sublabel="vibrate on taps and confirmations"
            right={
              <Switch
                value={haptics}
                onValueChange={setHaptics}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor={'#fff'}
                ios_backgroundColor={COLORS.border}
              />
            }
            showDivider
          />
          <Row
            label="reduce motion"
            sublabel="minimize animations and transitions"
            right={
              <Switch
                value={reduceMotion}
                onValueChange={setReduceMotion}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor={'#fff'}
                ios_backgroundColor={COLORS.border}
              />
            }
          />
        </Section>

        {/* Posts ──────────────────────────────────────────── */}
        <Section title="posts">
          <View style={styles.stack}>
            <Text style={styles.stackLabel}>auto-play videos</Text>
            <Segmented<VideoAutoplay>
              value={videoAutoplay}
              options={AUTOPLAY_OPTIONS}
              onChange={setVideoAutoplay}
            />
          </View>
          <View style={styles.divider} />
          <Row
            label="data saver"
            sublabel="reduce media quality on cellular"
            right={
              <Switch
                value={dataSaver}
                onValueChange={setDataSaver}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor={'#fff'}
                ios_backgroundColor={COLORS.border}
              />
            }
          />
        </Section>

        {/* About ──────────────────────────────────────────── */}
        <Section title="about">
          <Row
            label="version"
            right={<Text style={styles.rowValue}>{appVersion}</Text>}
            showDivider
          />
          <Row
            label="terms of service"
            right={<Ionicons name="open-outline" size={18} color={COLORS.textTertiary} />}
            onPress={() => openLink(TERMS_URL)}
            showDivider
          />
          <Row
            label="privacy policy"
            right={<Ionicons name="open-outline" size={18} color={COLORS.textTertiary} />}
            onPress={() => openLink(PRIVACY_URL)}
            showDivider
          />
          <Row
            label="contact support"
            sublabel={SUPPORT_EMAIL}
            right={<Ionicons name="mail-outline" size={18} color={COLORS.textTertiary} />}
            onPress={() => openLink(`mailto:${SUPPORT_EMAIL}`)}
            showDivider
          />
          <Row
            label="rate the app"
            right={<Ionicons name="star-outline" size={18} color={COLORS.textTertiary} />}
            onPress={() => openLink(RATE_URL)}
          />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.md,
  },
  title: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.bold,
    fontSize: FONTS.sizes.lg,
  },
  scroll: {
    paddingHorizontal: SPACING.base,
  },

  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginLeft: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical: 14,
    gap: SPACING.base,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderSubtle,
  },
  rowText: { flexShrink: 1 },
  rowLabel: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
  },
  rowSublabel: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    marginTop: 3,
  },
  rowRight: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '55%',
  },
  rowValue: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
    textAlign: 'right',
  },

  stack: {
    paddingHorizontal: SPACING.base,
    paddingVertical: 14,
    gap: SPACING.sm,
  },
  stackLabel: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
  },
  stackHint: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.borderSubtle,
  },

  segmented: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.full,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: COLORS.accent,
  },
  segmentText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
  },
  segmentTextActive: {
    color: COLORS.textInverse,
  },
});
