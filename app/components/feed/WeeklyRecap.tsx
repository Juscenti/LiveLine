// ============================================================
// components/feed/WeeklyRecap.tsx
// "Here's what happened this week" — floating banner + two-phase modal
//   Phase 1 (Photo Dump): auto-advancing image slideshow (images only)
//   Phase 2 (Post Stack): swipeable stacked-card post viewer
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { postsApi } from '@/services/api';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';
import type { Post } from '@/types';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_W = SW * 0.78;
const CARD_H = CARD_W * (5 / 4);
const AUTO_ADVANCE_MS = 3200;

// ─── Banner ─────────────────────────────────────────────────
interface BannerProps {
  posts: Post[];
  dateRange: string;
  topOffset: number;
  onOpen: () => void;
  onDismiss: () => void;
}

function RecapBanner({ posts, dateRange, topOffset, onOpen, onDismiss }: BannerProps) {
  const slideY = useRef(new Animated.Value(-100)).current;
  const panDY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 16,
      mass: 0.8,
      stiffness: 110,
    }).start();
  }, [slideY]);

  const dismiss = useCallback(() => {
    Animated.timing(slideY, { toValue: -120, useNativeDriver: true, duration: 200 }).start(onDismiss);
  }, [slideY, onDismiss]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy < 0) panDY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -40 || g.vy < -0.6) {
          dismiss();
        } else {
          Animated.spring(panDY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panDY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  // Collect up to 3 unique authors
  const seen = new Set<string>();
  const authors = posts
    .map((p) => p.author)
    .filter((a): a is NonNullable<typeof a> => {
      if (!a || seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    })
    .slice(0, 3);

  return (
    <Animated.View
      style={[
        styles.banner,
        { top: topOffset + SPACING.sm, transform: [{ translateY: Animated.add(slideY, panDY) }] },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity activeOpacity={0.88} onPress={onOpen} style={styles.bannerInner}>
        <View style={styles.bannerLeft}>
          <View style={styles.bannerTitleRow}>
            <Text style={styles.bannerSpark}>⚡</Text>
            <Text style={styles.bannerTitle} numberOfLines={1}>
              Here's what happened this week
            </Text>
          </View>
          <Text style={styles.bannerRange}>{dateRange}</Text>
        </View>
        {authors.length > 0 && (
          <View style={styles.bannerAvatarRow}>
            {authors.map((a, i) => (
              <View
                key={a.id}
                style={[
                  styles.bannerAvatarWrap,
                  { marginLeft: i === 0 ? 0 : -9, zIndex: authors.length - i },
                ]}
              >
                {a.profile_picture_url ? (
                  <Image
                    source={{ uri: a.profile_picture_url }}
                    style={styles.bannerAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.bannerAvatar, styles.bannerAvatarFallback]}>
                    <Text style={styles.bannerAvatarInitial}>
                      {(a.display_name ?? a.username ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
        <Ionicons name="chevron-forward" size={14} color={COLORS.textTertiary} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
      {/* Swipe-up handle */}
      <View style={styles.swipeHandle} pointerEvents="none">
        <View style={styles.swipeHandleBar} />
      </View>
    </Animated.View>
  );
}

// ─── Photo Dump Slide ────────────────────────────────────────
function PhotoDumpSlide({ post }: { post: Post }) {
  const name = post.author
    ? (post.author.display_name ?? post.author.username ?? '?')
    : '?';
  const day = dayjs(post.created_at).format('dddd');
  const time = dayjs(post.created_at).format('h:mm A');

  return (
    <View style={styles.dumpSlide}>
      <Image
        source={{ uri: post.thumbnail_url ?? post.media_url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={styles.dumpGradient}
      />
      <View style={styles.dumpMeta}>
        {post.author?.profile_picture_url ? (
          <Image
            source={{ uri: post.author.profile_picture_url }}
            style={styles.dumpAvatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.dumpAvatar, styles.dumpAvatarFallback]}>
            <Text style={styles.dumpAvatarInitial}>{name[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.dumpName}>📸  {name}</Text>
          <Text style={styles.dumpWhen}>
            {day} · {time}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Stacked Card ────────────────────────────────────────────
const STACK_ROTATIONS = [0, 3.5, -2.5];
const STACK_SCALES = [1, 0.965, 0.93];
const STACK_TRANSLATE_YS = [0, 13, 24];

function StackedCard({
  post,
  total,
  index,
  depth,
}: {
  post: Post;
  total: number;
  index: number;
  depth: number;
}) {
  const rot = STACK_ROTATIONS[depth] ?? STACK_ROTATIONS[2];
  const sc = STACK_SCALES[depth] ?? STACK_SCALES[2];
  const ty = STACK_TRANSLATE_YS[depth] ?? STACK_TRANSLATE_YS[2];

  return (
    <View
      style={[
        styles.stackCard,
        {
          transform: [{ rotate: `${rot}deg` }, { scale: sc }, { translateY: ty }],
          zIndex: 10 - depth,
        },
      ]}
    >
      <Image
        source={{ uri: post.thumbnail_url ?? post.media_url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      {depth === 0 && (
        <View style={styles.stackCounterBadge}>
          <Text style={styles.stackCounterText}>
            {index + 1} / {total}
          </Text>
        </View>
      )}
    </View>
  );
}


// ─── WeeklyRecap ─────────────────────────────────────────────
export default function WeeklyRecap({ topOffset = 0 }: { topOffset?: number }) {
  const isSaturday = dayjs().day() === 6;
  const insets = useSafeAreaInsets();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [phase, setPhase] = useState<'dump' | 'stack'>('dump');
  const [dumpIdx, setDumpIdx] = useState(0);
  const [stackIdx, setStackIdx] = useState(0);
  const [comment, setComment] = useState('');
  const dumpListRef = useRef<FlatList<Post>>(null);

  // Refs so the PanResponder (created once) always calls the current handler
  const stackNextRef = useRef<() => void>(() => {});
  const stackPrevRef = useRef<() => void>(() => {});
  stackNextRef.current = () => setStackIdx((i) => Math.min(i + 1, posts.length - 1));
  stackPrevRef.current = () => setStackIdx((i) => Math.max(i - 1, 0));

  const stackSwipe = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40 || g.vx < -0.5) stackNextRef.current();
        else if (g.dx > 40 || g.vx > 0.5) stackPrevRef.current();
      },
    })
  ).current;

  const imagePosts = posts.filter((p) => p.media_type === 'image');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await postsApi.getWeeklyRecap();
      setPosts(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSaturday) void load();
  }, [isSaturday, load]);

  // Auto-advance timer — resets whenever dumpIdx changes (manual swipe also updates dumpIdx)
  useEffect(() => {
    if (!modalOpen || phase !== 'dump' || imagePosts.length === 0) return;
    const t = setTimeout(() => {
      const next = dumpIdx + 1;
      if (next >= imagePosts.length) {
        setPhase('stack');
        return;
      }
      dumpListRef.current?.scrollToIndex({ index: next, animated: true });
      setDumpIdx(next);
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [modalOpen, phase, dumpIdx, imagePosts.length]);

  const saturday = dayjs();
  const sunday = saturday.subtract(6, 'day');
  const rangeLabel = `${sunday.format('MMM D')} – ${saturday.format('MMM D')}`;

  const openModal = () => {
    const hasImages = imagePosts.length > 0;
    setPhase(hasImages ? 'dump' : 'stack');
    setDumpIdx(0);
    setStackIdx(0);
    setComment('');
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const goToStack = () => {
    setPhase('stack');
    setStackIdx(0);
  };

  if (!isSaturday || (!loading && posts.length === 0) || dismissed) return null;

  const curPost = posts[stackIdx] ?? null;
  const authorName = curPost?.author
    ? (curPost.author.display_name ?? curPost.author.username ?? '?')
    : '?';
  const postDay = curPost ? dayjs(curPost.created_at).format('dddd') : '';

  // Safe area top used for modal content positioning
  const safeTop = insets.top;
  const safeBottom = insets.bottom;

  return (
    <>
      <RecapBanner
        posts={posts}
        dateRange={rangeLabel}
        topOffset={topOffset}
        onOpen={openModal}
        onDismiss={() => setDismissed(true)}
      />

      <Modal
        visible={modalOpen}
        animationType="slide"
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <View style={styles.modalBg}>
          {/* ── Phase 1: Photo Dump ─────────────────────── */}
          {phase === 'dump' && (
            <>
              {/* Progress segments */}
              <View style={[styles.progressRow, { top: safeTop + 8 }]}>
                {imagePosts.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.progressSeg,
                      {
                        backgroundColor:
                          i < dumpIdx
                            ? COLORS.accent
                            : i === dumpIdx
                            ? COLORS.accent
                            : 'rgba(255,255,255,0.28)',
                      },
                    ]}
                  />
                ))}
              </View>

              <FlatList
                ref={dumpListRef}
                data={imagePosts}
                keyExtractor={(p) => p.id}
                horizontal
                pagingEnabled
                scrollEnabled
                showsHorizontalScrollIndicator={false}
                getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
                renderItem={({ item }) => <PhotoDumpSlide post={item} />}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
                  if (idx >= imagePosts.length) {
                    goToStack();
                  } else {
                    setDumpIdx(idx);
                  }
                }}
                style={{ flex: 1 }}
              />

              {/* Close */}
              <TouchableOpacity
                style={[styles.dumpCloseBtn, { top: safeTop + 8 }]}
                onPress={closeModal}
              >
                <Ionicons name="close" size={20} color={COLORS.textPrimary} />
              </TouchableOpacity>

              {/* Skip to posts */}
              <TouchableOpacity
                style={[styles.dumpSkipBtn, { bottom: safeBottom + 32 }]}
                onPress={goToStack}
              >
                <Text style={styles.dumpSkipText}>See all posts</Text>
                <Ionicons name="arrow-forward" size={13} color={COLORS.accent} />
              </TouchableOpacity>
            </>
          )}

          {/* ── Phase 2: Post Stack ─────────────────────── */}
          {phase === 'stack' && curPost && (
            <View style={[styles.stackContainer, { paddingTop: safeTop, paddingBottom: safeBottom }]}>
              {/* Top bar */}
              <View style={styles.stackTopBar}>
                <TouchableOpacity onPress={closeModal} hitSlop={12}>
                  <Ionicons name="close" size={26} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.stackTopTitle}>This week</Text>
                <View style={{ width: 26 }} />
              </View>

              {/* Card stack — swipe left/right to navigate */}
              <View style={styles.stackCardArea}>
                {posts[stackIdx + 2] && (
                  <StackedCard
                    post={posts[stackIdx + 2]}
                    total={posts.length}
                    index={stackIdx + 2}
                    depth={2}
                  />
                )}
                {posts[stackIdx + 1] && (
                  <StackedCard
                    post={posts[stackIdx + 1]}
                    total={posts.length}
                    index={stackIdx + 1}
                    depth={1}
                  />
                )}
                <StackedCard
                  post={curPost}
                  total={posts.length}
                  index={stackIdx}
                  depth={0}
                />
                {/* Transparent overlay rendered last so it sits on top and captures all swipe gestures */}
                <View style={StyleSheet.absoluteFill} {...stackSwipe.panHandlers} />
              </View>

              {/* Author row */}
              <View style={styles.stackAuthorRow}>
                {curPost.author?.profile_picture_url ? (
                  <Image
                    source={{ uri: curPost.author.profile_picture_url }}
                    style={styles.stackAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.stackAvatar, styles.stackAvatarFallback]}>
                    <Text style={styles.stackAvatarInitial}>
                      {authorName[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.stackAuthorName}>{authorName}</Text>
                  <Text style={styles.stackAuthorDay}>{postDay}</Text>
                </View>
                <TouchableOpacity hitSlop={12}>
                  <Ionicons
                    name="arrow-up-circle-outline"
                    size={28}
                    color={COLORS.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={12} style={{ marginLeft: SPACING.md }}>
                  <Ionicons
                    name="ellipsis-horizontal-circle-outline"
                    size={28}
                    color={COLORS.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              {/* Comment input */}
              <View style={styles.stackCommentRow}>
                <TextInput
                  style={styles.stackCommentInput}
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Leave a comment..."
                  placeholderTextColor={COLORS.textTertiary}
                  returnKeyType="send"
                />
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Banner ───────────────────────────────────────────────
  banner: {
    position: 'absolute',
    left: SPACING.base,
    right: SPACING.base,
    zIndex: 20,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  bannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  bannerLeft: { flex: 1, gap: 3 },
  bannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerSpark: { fontSize: 14 },
  bannerTitle: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
  },
  bannerRange: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
  },
  bannerAvatarRow: { flexDirection: 'row', alignItems: 'center' },
  bannerAvatarWrap: {
    borderWidth: 1.5,
    borderColor: COLORS.bgCard,
    borderRadius: 99,
  },
  bannerAvatar: { width: 26, height: 26, borderRadius: 13 },
  bannerAvatarFallback: {
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerAvatarInitial: {
    fontSize: 9,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  swipeHandle: { alignItems: 'center', paddingBottom: 7 },
  swipeHandleBar: {
    width: 30,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // ── Modal ────────────────────────────────────────────────
  modalBg: { flex: 1, backgroundColor: COLORS.bg },

  // ── Photo Dump ───────────────────────────────────────────
  progressRow: {
    position: 'absolute',
    left: SPACING.base,
    right: SPACING.base,
    flexDirection: 'row',
    gap: 4,
    zIndex: 10,
  },
  progressSeg: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
  },
  dumpSlide: {
    width: SW,
    height: SH,
  },
  dumpGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  dumpMeta: {
    position: 'absolute',
    bottom: 110,
    left: SPACING.base,
    right: SPACING.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dumpAvatar: { width: 42, height: 42, borderRadius: 21 },
  dumpAvatarFallback: {
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dumpAvatarInitial: {
    fontSize: 16,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  dumpName: {
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
  },
  dumpWhen: {
    fontSize: FONTS.sizes.xs,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  dumpCloseBtn: {
    position: 'absolute',
    right: SPACING.base,
    zIndex: 20,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dumpSkipBtn: {
    position: 'absolute',
    right: SPACING.base,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: `${COLORS.accent}40`,
  },
  dumpSkipText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.accent,
  },

  // ── Post Stack ───────────────────────────────────────────
  stackContainer: {
    flex: 1,
    paddingHorizontal: SPACING.base,
  },
  stackTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  stackTopTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  stackCardArea: {
    alignItems: 'center',
    justifyContent: 'center',
    height: CARD_H + 44,
    marginTop: SPACING.sm,
  },
  stackCard: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.bgElevated,
  },
  stackCounterBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.58)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  stackCounterText: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.semibold,
  },
  stackAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  stackAvatar: { width: 42, height: 42, borderRadius: 21 },
  stackAvatarFallback: {
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackAvatarInitial: {
    fontSize: 17,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  stackAuthorName: {
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.textPrimary,
  },
  stackAuthorDay: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  stackCommentRow: {
    marginTop: SPACING.md,
  },
  stackCommentInput: {
    height: 46,
    backgroundColor: COLORS.bgElevated,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
