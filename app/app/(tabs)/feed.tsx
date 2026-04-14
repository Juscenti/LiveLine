// ============================================================
// app/(tabs)/feed.tsx — Moment feed (Pinterest-style masonry)
// ============================================================
import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import {
  View,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedStore } from '@/stores/feedStore';
import { COLORS, SPACING, FONTS, FEED, FEED_PLAY_ZONE, computeFeedPlayZoneLayout } from '@/constants';
import PostCard from '@/components/feed/PostCard';
import WeeklyRecap from '@/components/feed/WeeklyRecap';
import type { FeedPost } from '@/types';
import { useResponsive } from '@/utils/responsive';

/** Single source for overlay pixel size (see computeFeedPlayZoneLayout tuning in constants). */
function useFeedPlayZone(columnWidth: number, windowWidth: number) {
  return useMemo(
    () => computeFeedPlayZoneLayout(columnWidth, windowWidth),
    [columnWidth, windowWidth],
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const [feedWidth, setFeedWidth] = useState(0);
  const { posts, isLoading, isRefreshing, hasMore, loadFeed, loadMore, refresh } = useFeedStore();
  const showEmpty = !isLoading && posts.length === 0;

  const [didInitialLoad, setDidInitialLoad] = useState(false);
  const prefetchAttemptsRef = useRef(0);
  // How far ahead we want to buffer immediately after the first page loads.
  // (Masonry heights vary, so this is “safe” rather than pixel-perfect.)
  const PREFETCH_MIN_POSTS_AHEAD = 18;
  const MAX_PREFETCH_ATTEMPTS = 2;

  /**
   * Full-bleed masonry: no side padding; tight gutter between columns only.
   * Use measured width (not `useWindowDimensions` alone) so column math matches the
   * actual list — avoids a 1px+ sliver on the right from float/rounding drift.
   */
  const { columnWidth, gutter, innerWidth } = useMemo(() => {
    const inner = Math.round(feedWidth > 0 ? feedWidth : r.width);
    const g = Math.max(6, Math.round(inner * 0.014));
    const colW = (inner - 2 * g) / 2;
    return { columnWidth: colW, gutter: g, innerWidth: inner };
  }, [feedWidth, r.width]);

  const { playZoneTop, playZoneHeight } = useFeedPlayZone(columnWidth, r.width);

  useEffect(() => {
    void (async () => {
      await loadFeed();
      setDidInitialLoad(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useEffect(() => {
    if (!isRefreshing) return;
    // If the user pulls to refresh, reset the “buffer ahead” attempts.
    prefetchAttemptsRef.current = 0;
  }, [isRefreshing]);

  // Preload a bit more feed content right after initial load, so when the user starts
  // swiping down they don't have to wait on the next network call.
  useEffect(() => {
    if (!didInitialLoad) return;
    if (isRefreshing) return;
    if (isLoading) return;
    if (!hasMore) return;
    if (posts.length >= PREFETCH_MIN_POSTS_AHEAD) return;
    if (prefetchAttemptsRef.current >= MAX_PREFETCH_ATTEMPTS) return;
    prefetchAttemptsRef.current += 1;
    void loadMore();
  }, [didInitialLoad, isRefreshing, isLoading, hasMore, posts.length, loadMore]);

  // ── Play-band autoplay (overlay lines = source of truth via measureInWindow) ─
  //
  // Any video whose **media** tile intersects the band plays — even a 1px sliver.
  // If several tiles intersect, order is top → bottom on screen (smaller Y first),
  // then left → right tie-break. They rotate every PLAY_INTERVAL_MS in that order.
  //
  // visibleVideos: ordered IDs (top-to-bottom in band); playingIdx indexes into it
  const PLAY_INTERVAL_MS = 4000;
  const [visibleVideos, setVisibleVideos] = useState<string[]>([]);
  const [playingIdx, setPlayingIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevVisibleVideosRef = useRef<string[]>([]);

  // When the play-band set changes:
  // - stop immediately switching to the "next" tile after the one currently playing
  //   (so if A is playing and B enters the band, B starts right away).
  // - still rotate every `PLAY_INTERVAL_MS` among the current band tiles.
  useEffect(() => {
    const prevList = prevVisibleVideosRef.current;
    const prevActiveId = prevList[playingIdx] ?? null;
    const expandedByOne = prevList.length + 1 === visibleVideos.length;

    let nextPlayingIdx = 0;
    if (visibleVideos.length === 0) {
      nextPlayingIdx = 0;
    } else if (prevActiveId && visibleVideos.includes(prevActiveId)) {
      if (visibleVideos.length === 1) {
        nextPlayingIdx = 0;
      } else {
        const currentIdxInNext = visibleVideos.indexOf(prevActiveId);
        // If exactly one new tile entered the band, switch immediately to the
        // next tile in the on-screen order. Otherwise, keep playing the current tile.
        nextPlayingIdx = expandedByOne ? (currentIdxInNext + 1) % visibleVideos.length : currentIdxInNext;
      }
    } else {
      // Active tile left the band; restart at the topmost intersecting tile.
      nextPlayingIdx = 0;
    }

    setPlayingIdx(nextPlayingIdx);

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (visibleVideos.length > 1) {
      timerRef.current = setInterval(() => {
        setPlayingIdx((prev) => (prev + 1) % visibleVideos.length);
      }, PLAY_INTERVAL_MS);
    }

    prevVisibleVideosRef.current = visibleVideos;
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visibleVideos]);

  const playingPostId = visibleVideos[playingIdx] ?? null;

  const listWrapRef = useRef<View>(null);
  const playZoneOverlayRef = useRef<View>(null);
  const mediaRefs = useRef<Map<string, View | null>>(new Map());
  const viewableRef = useRef<{ isViewable: boolean; index: number | null; item: FeedPost }[]>([]);
  const rafEvalRef = useRef<number | null>(null);
  // Cache overlay band bounds to avoid re-measuring them on every scroll.
  const overlayBoundsRef = useRef<{ left: number; top: number; right: number; bottom: number } | null>(null);
  // Throttle measureInWindow calls during fast scroll.
  const lastEvalAtRef = useRef<number>(0);
  const evalThrottleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evaluatePlayZoneRef = useRef<() => void>(() => {});
  const evaluatePlayZone = useCallback(() => {
    const wrap = listWrapRef.current;
    const overlay = playZoneOverlayRef.current;

    const applyZone = (
      zoneLeft: number,
      zoneTopWin: number,
      zoneRight: number,
      zoneBottomWin: number,
    ) => {
      const MAX_MEDIA_MEASURE_CANDIDATES = 20;
      const candidatesAll = viewableRef.current.filter(
        (v) => v.isViewable && v.item?.media_type === 'video' && v.index != null,
      );
      const candidates = candidatesAll
        .slice()
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .slice(0, MAX_MEDIA_MEASURE_CANDIDATES);

      if (candidates.length === 0) {
        setVisibleVideos((prev) => (prev.length === 0 ? prev : []));
        return;
      }

      const hits: { id: string; index: number; topY: number; leftX: number }[] = [];
      let pending = candidates.length;

      const finish = () => {
        if (--pending !== 0) return;
        hits.sort((a, b) => (a.topY !== b.topY ? a.topY - b.topY : a.leftX - b.leftX));
        const topVideos = hits.map((h) => h.id);

        if (topVideos.length === 0) {
          setVisibleVideos((prev) => (prev.length === 0 ? prev : []));
          return;
        }

        setVisibleVideos((prev) => {
          if (prev.length === topVideos.length && prev.every((id, i) => id === topVideos[i])) {
            return prev;
          }
          return topVideos;
        });
      };

      for (const v of candidates) {
        const id = v.item!.id;
        const idx = v.index!;
        const media = mediaRefs.current.get(id);
        if (!media) {
          finish();
          continue;
        }
        media.measureInWindow((cx, cy, cw, ch) => {
          const cellTop = cy;
          const cellBottom = cy + ch;
          const cellLeft = cx;
          const cellRight = cx + cw;
          // Any overlap with the band, including a thin slice (strict < for opposite edges).
          const vOverlap = cellBottom > zoneTopWin && cellTop < zoneBottomWin;
          const hOverlap = cellRight > zoneLeft && cellLeft < zoneRight;
          if (vOverlap && hOverlap) hits.push({ id, index: idx, topY: cy, leftX: cx });
          finish();
        });
      }
    };

    const fallbackFromWrap = () => {
      if (!wrap) return;
      wrap.measureInWindow((lx, ly, lw, _lh) => {
        applyZone(lx, ly + playZoneTop, lx + lw, ly + playZoneTop + playZoneHeight);
      });
    };

    if (overlayBoundsRef.current) {
      const b = overlayBoundsRef.current;
      applyZone(b.left, b.top, b.right, b.bottom);
      return;
    }

    if (overlay) {
      overlay.measureInWindow((px, py, pw, ph) => {
        if (pw > 0 && ph > 0) {
          overlayBoundsRef.current = { left: px, top: py, right: px + pw, bottom: py + ph };
          applyZone(px, py, px + pw, py + ph);
        } else {
          overlayBoundsRef.current = null;
          fallbackFromWrap();
        }
      });
    } else {
      fallbackFromWrap();
    }
  }, [playZoneTop, playZoneHeight]);

  evaluatePlayZoneRef.current = evaluatePlayZone;

  const schedulePlayZoneEval = useCallback(() => {
    const now = Date.now();
    const MIN_EVAL_INTERVAL_MS = 60;

    const scheduleNow = () => {
      if (rafEvalRef.current != null) return;
      rafEvalRef.current = requestAnimationFrame(() => {
        rafEvalRef.current = null;
        lastEvalAtRef.current = Date.now();
        evaluatePlayZoneRef.current();
      });
    };

    if (now - lastEvalAtRef.current >= MIN_EVAL_INTERVAL_MS) {
      scheduleNow();
      return;
    }

    const remaining = MIN_EVAL_INTERVAL_MS - (now - lastEvalAtRef.current);
    if (evalThrottleTimeoutRef.current) clearTimeout(evalThrottleTimeoutRef.current);
    evalThrottleTimeoutRef.current = setTimeout(() => {
      evalThrottleTimeoutRef.current = null;
      scheduleNow();
    }, remaining);
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { isViewable: boolean; index: number | null; item: FeedPost }[] }) => {
      viewableRef.current = viewableItems;
      schedulePlayZoneEval();
    },
    [schedulePlayZoneEval],
  );

  useEffect(() => {
    schedulePlayZoneEval();
  }, [playZoneTop, playZoneHeight, posts, schedulePlayZoneEval]);

  // Overlay band geometry changes only when layout changes, so drop cached bounds then.
  useEffect(() => {
    overlayBoundsRef.current = null;
  }, [playZoneTop, playZoneHeight]);

  /**
   * `itemVisiblePercentThreshold: 0` — a pixel visible can surface a candidate;
   * the overlay geometry in `evaluatePlayZone` decides actual overlap with the band.
   */
  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 0,
      minimumViewTime: 0,
      waitForInteraction: false,
    }),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: FeedPost }) => (
      <View style={{ width: columnWidth, marginHorizontal: gutter / 2, marginBottom: gutter }}>
        <PostCard
          key={item.id}
          post={item}
          width={columnWidth}
          onPress={() => router.push(`/post/${item.id}`)}
          shouldPlay={item.id === playingPostId}
          mediaMeasureRef={
            item.media_type === 'video'
              ? (node) => {
                  if (node) mediaRefs.current.set(item.id, node);
                  else mediaRefs.current.delete(item.id);
                }
              : undefined
          }
        />
      </View>
    ),
    [columnWidth, gutter, playingPostId],
  );

  const bottomPad = 100 + insets.bottom;

  const feedScale = Math.min(r.scale * 1.08, 1.45);
  const postBtnSize = Math.round(44 * feedScale);
  const headerPad = Math.max(10, r.width * 0.03);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingHorizontal: headerPad }]}>
        <Text style={[styles.wordmark, { fontSize: FONTS.sizes.xl * feedScale }]}>liveline</Text>
        <TouchableOpacity
          style={[
            styles.postBtn,
            {
              width: postBtnSize,
              height: postBtnSize,
              borderRadius: postBtnSize / 2,
            },
          ]}
          onPress={() => router.push('/camera')}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={Math.round(22 * feedScale)} color={COLORS.textInverse} />
        </TouchableOpacity>
      </View>

      <View
        style={styles.feedColumn}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          setFeedWidth((prev) => (prev === w ? prev : w));
        }}
      >
        <View ref={listWrapRef} style={styles.listWrap} collapsable={false}>
          <FlashList
            style={styles.list}
            data={posts}
            masonry
            numColumns={2}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            extraData={playingPostId}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onScroll={schedulePlayZoneEval}
            scrollEventThrottle={16}
            // Render ahead so images/videos for the next few items start decoding
            // before the user scrolls all the way there.
            drawDistance={1600}
            maxItemsInRecyclePool={60}
            overrideProps={{ initialDrawBatchSize: 12 }}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: bottomPad, width: innerWidth },
            ]}
            ListHeaderComponent={<WeeklyRecap />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.8}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refresh}
                tintColor={COLORS.accent}
              />
            }
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.empty}>
                  <ActivityIndicator color={COLORS.accent} size="large" />
                </View>
              ) : showEmpty ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>⚡</Text>
                  <Text style={[styles.emptyTitle, { fontSize: FONTS.sizes.lg * feedScale }]}>
                    Nothing yet
                  </Text>
                  <Text style={[styles.emptyText, { fontSize: FONTS.sizes.sm * feedScale }]}>
                    Add some friends or post your first moment.
                  </Text>
                </View>
              ) : null
            }
            showsVerticalScrollIndicator={false}
          />
          {!showEmpty && posts.length > 0 ? (
            <View
              ref={playZoneOverlayRef}
              pointerEvents="none"
              collapsable={false}
              style={[
                styles.playZoneOverlay,
                { top: playZoneTop, height: playZoneHeight },
              ]}
            >
              <View style={styles.playZoneLine} />
              <View style={styles.playZoneFill} />
              <View style={styles.playZoneLine} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FEED.background },
  feedColumn: {
    flex: 1,
    width: '100%',
  },
  listWrap: {
    flex: 1,
    position: 'relative',
  },
  playZoneOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'space-between',
  },
  playZoneLine: {
    height: 2,
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 1,
  },
  playZoneFill: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: SPACING.sm,
    backgroundColor: FEED.background,
  },
  wordmark: {
    fontWeight: FONTS.weights.black,
    color: COLORS.accent,
    letterSpacing: -1,
  },
  postBtn: {
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: { flex: 1, width: '100%' },
  listContent: {
    paddingTop: FEED_PLAY_ZONE.listContentPaddingTop,
  },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: {
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  emptyText: { color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: SPACING.lg },
});
