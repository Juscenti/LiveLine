import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated,
  PanResponder,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, RADIUS, SPACING, TAB_BAR } from '@/constants';
import MusicBadge from '@/components/music/MusicBadge';
import { getOrCreateDirectConversation } from '@/services/conversations';
import type { MapFriend, MusicPlatform, MusicTrack } from '@/types';

interface Props {
  friend: MapFriend;
  onClose: () => void;
}

function normalizeMusicSource(raw: string | null | undefined): MusicPlatform {
  if (raw === 'apple_music' || raw === 'soundcloud' || raw === 'spotify') return raw;
  return 'spotify';
}

export default function FriendMapSheet({ friend, onClose }: Props) {
  const [msgLoading, setMsgLoading] = useState(false);
  const insets = useSafeAreaInsets();

  // Main sheet slide
  const translateY = useRef(new Animated.Value(240)).current;
  // Per-section stagger
  const headerOpacity  = useRef(new Animated.Value(0)).current;
  const headerSlide    = useRef(new Animated.Value(12)).current;
  const metaOpacity    = useRef(new Animated.Value(0)).current;
  const metaSlide      = useRef(new Animated.Value(12)).current;
  const bodyOpacity    = useRef(new Animated.Value(0)).current;
  const bodySlide      = useRef(new Animated.Value(12)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;
  const actionsSlide   = useRef(new Animated.Value(12)).current;
  // Avatar pulse ring (music playing)
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.55)).current;
  // Drag delta (separate from main translateY for clean spring-back)
  const panDy = useRef(new Animated.Value(0)).current;

  const sheetBottom = useMemo(
    () => insets.bottom + TAB_BAR.bottomGap + TAB_BAR.height + TAB_BAR.sheetGap,
    [insets.bottom],
  );

  const isNowPlaying =
    friend.music_is_currently_playing !== undefined
      ? friend.music_is_currently_playing
      : !!friend.music_song;

  const fakeTrack: MusicTrack | null = friend.music_song
    ? {
        id: 'map',
        user_id: friend.user_id,
        song: friend.music_song,
        artist: friend.music_artist ?? '',
        album: null,
        cover_url: friend.music_cover_url,
        source: normalizeMusicSource(friend.music_source ?? null),
        platform_track_id: null,
        track_url: null,
        duration_ms: null,
        is_currently_playing: isNowPlaying,
        updated_at: new Date().toISOString(),
      }
    : null;

  const bio = friend.bio?.trim();

  const distanceLabel = useMemo(() => {
    const meters = friend.distance_meters;
    if (!Number.isFinite(meters)) return null;
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }, [friend.distance_meters]);

  // ── Entrance ──
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 13,
      tension: 105,
    }).start(() => {
      const fade = (o: Animated.Value, s: Animated.Value, delay: number) =>
        Animated.parallel([
          Animated.timing(o, { toValue: 1, duration: 280, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(s, { toValue: 0, duration: 280, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]);
      Animated.parallel([
        fade(headerOpacity,  headerSlide,  0),
        fade(metaOpacity,    metaSlide,    55),
        fade(bodyOpacity,    bodySlide,    110),
        fade(actionsOpacity, actionsSlide, 165),
      ]).start();
    });

    // Pulsing halo while music plays
    if (isNowPlaying) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseScale,   { toValue: 1.22, duration: 1200, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0,    duration: 1200, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseScale,   { toValue: 1,    duration: 1200, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.55, duration: 1200, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
          ]),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, []);

  const closeWithSlide = () => {
    Animated.timing(translateY, {
      toValue: 380,
      duration: 210,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  const handlePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) panDy.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.85) {
          panDy.setValue(0);
          closeWithSlide();
          return;
        }
        Animated.spring(panDy, { toValue: 0, useNativeDriver: true, friction: 9, tension: 120 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(panDy, { toValue: 0, useNativeDriver: true, friction: 9, tension: 120 }).start();
      },
    }),
  ).current;

  const combinedY = Animated.add(translateY, panDy);

  const openMessage = async () => {
    setMsgLoading(true);
    try {
      const r = await getOrCreateDirectConversation(friend.user_id);
      if (r.ok) {
        closeWithSlide();
        router.push(`/messages/${r.conversationId}`);
      } else {
        Alert.alert('Could not open chat', r.message);
      }
    } finally {
      setMsgLoading(false);
    }
  };

  const openProfile = () => {
    closeWithSlide();
    router.push(`/profile/${friend.user_id}`);
  };

  return (
    <Animated.View
      style={[s.sheet, { bottom: sheetBottom, transform: [{ translateY: combinedY }] }]}
      pointerEvents="box-none"
    >
      {/* Frosted glass base */}
      <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
      {/* Dark tint overlay */}
      <View style={[StyleSheet.absoluteFill, s.overlay]} />
      {/* Subtle top edge highlight */}
      <View style={s.topEdge} />

      {/* Drag handle */}
      <View style={s.dragZone} {...handlePan.panHandlers}>
        <View style={s.handle} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
      >
        {/* ── Header ── */}
        <Animated.View
          style={[s.row, { opacity: headerOpacity, transform: [{ translateY: headerSlide }] }]}
        >
          <TouchableOpacity
            onPress={openProfile}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <View style={s.avatarWrapper}>
              {isNowPlaying && (
                <Animated.View
                  style={[
                    s.pulseRing,
                    { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                  ]}
                />
              )}
              <LinearGradient
                colors={[COLORS.accent, `${COLORS.accent}55`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.avatarRing}
              >
                {friend.profile_picture_url ? (
                  <Image source={{ uri: friend.profile_picture_url }} style={s.avatar} />
                ) : (
                  <View style={[s.avatar, s.avatarPlaceholder]}>
                    <Text style={s.avatarInitial}>
                      {(friend.display_name ?? friend.username)[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={{ flex: 1 }} onPress={openProfile} activeOpacity={0.8}>
            <Text style={s.name} numberOfLines={1}>
              {friend.display_name ?? friend.username}
            </Text>
            <Text style={s.username}>@{friend.username}</Text>
            {friend.activity_status ? (
              <View style={s.statusRow}>
                <View style={s.statusDot} />
                <Text style={s.status}>{friend.activity_status}</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={closeWithSlide}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            style={s.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={16} color={COLORS.textTertiary} />
          </TouchableOpacity>
        </Animated.View>

        {/* ── Meta chips ── */}
        <Animated.View
          style={[s.metaRow, { opacity: metaOpacity, transform: [{ translateY: metaSlide }] }]}
        >
          {distanceLabel ? (
            <View style={s.chip}>
              <Ionicons name="navigate" size={10} color={COLORS.accent} />
              <Text style={s.chipText}>{distanceLabel} away</Text>
            </View>
          ) : null}
          <View style={[s.chip, isNowPlaying && s.chipActive]}>
            <Ionicons
              name={isNowPlaying ? 'musical-notes' : fakeTrack ? 'musical-note' : 'headset-outline'}
              size={10}
              color={isNowPlaying ? COLORS.accent : COLORS.textTertiary}
            />
            <Text style={[s.chipText, isNowPlaying && s.chipTextAccent]}>
              {isNowPlaying ? 'Now playing' : fakeTrack ? 'Recently played' : 'No music'}
            </Text>
            {isNowPlaying && <View style={s.liveDot} />}
          </View>
        </Animated.View>

        {/* ── Bio + music ── */}
        <Animated.View style={{ opacity: bodyOpacity, transform: [{ translateY: bodySlide }] }}>
          {bio ? (
            <Text style={s.bio} numberOfLines={4}>
              {bio}
            </Text>
          ) : null}

          {fakeTrack ? (
            <View style={[s.musicWrap, isNowPlaying && s.musicWrapActive]}>
              <MusicBadge track={fakeTrack} style={s.music} />
            </View>
          ) : (
            <View style={s.noMusic}>
              <Ionicons name="musical-notes-outline" size={18} color="#2A2A2A" />
              <Text style={s.noMusicText}>Nothing playing right now</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Actions ── */}
        <Animated.View
          style={[s.actions, { opacity: actionsOpacity, transform: [{ translateY: actionsSlide }] }]}
        >
          {/* Message — full gradient */}
          <TouchableOpacity
            style={s.messageBtn}
            onPress={openMessage}
            disabled={msgLoading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[COLORS.accent, `${COLORS.accent}BB`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.messageBtnInner}
            >
              {msgLoading ? (
                <ActivityIndicator color={COLORS.textInverse} size="small" />
              ) : (
                <>
                  <Ionicons name="chatbubble" size={14} color={COLORS.textInverse} />
                  <Text style={s.messageBtnText}>Message</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Profile — ghost */}
          <TouchableOpacity style={s.profileBtn} onPress={openProfile} activeOpacity={0.8}>
            <Ionicons name="person-outline" size={14} color={COLORS.textSecondary} />
            <Text style={s.profileBtnText}>Profile</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // ── Sheet shell ──
  sheet: {
    position: 'absolute',
    left: SPACING.base,
    right: SPACING.base,
    maxHeight: '58%',
    zIndex: 9,
    borderRadius: RADIUS.xl + 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ffffff0F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.65,
    shadowRadius: 36,
    elevation: 26,
  },
  overlay: {
    backgroundColor: '#0C0C0CF2',
  },
  topEdge: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: '#ffffff14',
    borderRadius: 999,
  },

  // ── Drag handle ──
  dragZone: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    alignItems: 'center',
  },
  handle: {
    width: 34,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#ffffff18',
  },

  // ── Scroll ──
  scroll: { maxHeight: 500 },
  scrollContent: {
    paddingHorizontal: SPACING.base,
    paddingBottom: SPACING.base,
  },

  // ── Header row ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  avatarWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  avatarRing: {
    padding: 2.5,
    borderRadius: 999,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#0C0C0C',
  },
  avatarPlaceholder: {
    backgroundColor: '#1C1C1C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.bold,
    fontSize: FONTS.sizes.lg,
    letterSpacing: 0.5,
  },
  name: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.bold,
    fontSize: FONTS.sizes.base + 1,
    letterSpacing: 0.1,
  },
  username: {
    color: COLORS.textTertiary,
    fontSize: FONTS.sizes.xs,
    marginTop: 1,
    letterSpacing: 0.3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowRadius: 5,
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 0 },
  },
  status: {
    color: COLORS.accent,
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.medium,
    letterSpacing: 0.1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#191919',
    borderWidth: 1,
    borderColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Meta chips ──
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#141414',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#222',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipActive: {
    borderColor: `${COLORS.accent}33`,
    backgroundColor: `${COLORS.accent}0D`,
  },
  chipText: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: FONTS.weights.medium,
    letterSpacing: 0.2,
  },
  chipTextAccent: {
    color: COLORS.accent,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.accent,
    marginLeft: 2,
    shadowColor: COLORS.accent,
    shadowRadius: 4,
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 0 },
  },

  // ── Bio ──
  bio: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
    lineHeight: 21,
    marginBottom: SPACING.md,
    letterSpacing: 0.1,
  },

  // ── Music ──
  musicWrap: {
    borderRadius: RADIUS.md + 2,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: '#202020',
  },
  musicWrapActive: {
    borderColor: `${COLORS.accent}25`,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
  },
  music: {},
  noMusic: {
    backgroundColor: '#111',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    alignItems: 'center',
    gap: 8,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  noMusicText: {
    color: '#2E2E2E',
    fontSize: FONTS.sizes.sm,
    letterSpacing: 0.3,
  },

  // ── Actions ──
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: 2,
  },
  messageBtn: {
    flex: 1,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  messageBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    minHeight: 48,
  },
  messageBtnText: {
    color: COLORS.textInverse,
    fontWeight: FONTS.weights.bold,
    fontSize: FONTS.sizes.sm,
    letterSpacing: 0.4,
  },
  profileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#141414',
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#242424',
    minHeight: 48,
  },
  profileBtnText: {
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.semibold,
    fontSize: FONTS.sizes.sm,
    letterSpacing: 0.3,
  },
});