// ============================================================
// constants/index.ts
// ============================================================

export const COLORS = {
  // Brand
  accent: '#00FF94',       // neon green — primary CTA
  accentDim: '#00CC75',
  accentMuted: '#00FF9420',

  // Backgrounds (match feed / pure black for one surface)
  bg: '#000000',
  bgCard: '#141414',
  bgElevated: '#1C1C1C',
  bgSheet: '#161616',

  // Borders
  border: '#2A2A2A',
  borderSubtle: '#1F1F1F',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#888888',
  textTertiary: '#555555',
  textInverse: '#0A0A0A',

  // States
  error: '#FF4444',
  warning: '#FFB800',
  success: '#00FF94',
  info: '#4488FF',

  // Map
  mapMarkerSelf: '#00FF94',
  mapMarkerFriend: '#FFFFFF',

  // Music platforms
  spotify: '#1DB954',
  appleMusic: '#FC3C44',
  soundcloud: '#FF5500',

  // Floating bottom tab bar (pill dock) — 50% transparent bar + softer active pill
  tabBarPill: 'rgba(52, 53, 54, 0.5)',
  tabBarPillActive: 'rgba(92, 94, 96, 0.55)',
  tabBarIcon: '#FFFFFF',
};

/** Floating tab bar metrics — keep in sync with `app/(tabs)/_layout.tsx` `FloatingTabBar` */
export const TAB_BAR = {
  iconSize: 23,
  height: Math.round(23 * 2.5),
  bottomGap: 14,
  /** Space between tab dock top and overlays (e.g. map friend sheet) */
  sheetGap: 10,
} as const;

export const FONTS = {
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    xxl: 32,
    display: 42,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    black: '900' as const,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const TIMING = {
  fast: 150,
  normal: 250,
  slow: 400,
};

export const POST = {
  MAX_DURATION_SEC: 5,
  MAX_VIDEO_SIZE_MB: 50,
  MAX_IMAGE_SIZE_MB: 10,
  EXPIRY_HOURS: 24,
  GRID_COLUMNS: 2,
};

/**
 * Band geometry + tuning for the feed play-zone overlay and autoplay hit-test
 * (must match the fractions used in layout — tune here only).
 * `listContentPaddingTop` must stay in sync with feed `listContent.paddingTop`.
 */
export const FEED_PLAY_ZONE = {
  listContentPaddingTop: 8,
  /** Used when `columnWidth` is not measured yet: `(windowWidth - inset) / 2` */
  columnWidthFallbackInset: 24,
  /** Same clamp as PostCard tile height (portrait estimate) */
  maxTileHFactor: 6,
  minTileHFactor: 0.52,
  estPortraitAspect: 9 / 16,
  halfBandOfFullMinPx: 8,
  /** Vertical band height: half of full estimate, then two trims of this fraction */
  heightTrimFraction: 1 / 5,
  /** Shift overlay up by this fraction of “full” tile height */
  offsetUpFraction: 1 / 5,
  /** Down nudge (fraction of full height) after offset */
  downNudgeFraction: 1 / 7,
  /** Final up nudge (fraction of full height) */
  upNudgeFraction: 1 / 20,
  minBandHeightPx: 6,
} as const;

/** Pixel layout for the absolute play-zone overlay (and fallback hit-test vs listWrap). */
export function computeFeedPlayZoneLayout(
  columnWidth: number,
  windowWidth: number,
): { playZoneTop: number; playZoneHeight: number } {
  const pz = FEED_PLAY_ZONE;
  const w = columnWidth > 0 ? columnWidth : (windowWidth - pz.columnWidthFallbackInset) / 2;
  const naturalH = w / pz.estPortraitAspect;
  const full = Math.round(
    Math.min(Math.max(naturalH, w * pz.minTileHFactor), w * pz.maxTileHFactor),
  );
  const trim = 1 - pz.heightTrimFraction;
  const halfBand = Math.max(Math.round(full * 0.5), pz.halfBandOfFullMinPx);
  const baseHeight = Math.max(Math.round(halfBand * trim * trim), pz.minBandHeightPx);
  const offsetUp = Math.round(full * pz.offsetUpFraction);
  const downNudge = Math.round(full * pz.downNudgeFraction);
  const upNudge = Math.round(full * pz.upNudgeFraction);
  const baseTopUnclamped = pz.listContentPaddingTop - offsetUp;
  const topBefore = Math.max(0, baseTopUnclamped);
  const topAfter = Math.max(0, baseTopUnclamped + downNudge);
  const heightExtra = Math.max(0, downNudge - (topAfter - topBefore));
  const totalHeight = baseHeight + heightExtra;
  const topLifted = Math.max(0, topAfter - upNudge);
  const topMovedBy = topAfter - topLifted;
  const heightFinal = Math.max(pz.minBandHeightPx, totalHeight - (upNudge - topMovedBy));
  return { playZoneTop: topLifted, playZoneHeight: heightFinal };
}

/** Pinterest-style feed masonry */
export const FEED = {
  /** Pure black feed background */
  background: '#000000',
  /** Gap between columns and vertical stack */
  gutter: 9,
  /** Corner radius on media tiles */
  tileRadius: 22,
  /** When media_width/height missing (legacy posts) */
  fallbackAspect: 4 / 5,
  /** Space below image for username row */
  footerMinHeight: 30,
};

export const MAP = {
  DEFAULT_RADIUS_METERS: 50000, // 50km "large scale"
  UPDATE_INTERVAL_MS: 15000,   // 15 sec throttle
  NEARBY_POLL_INTERVAL_MS: 15000,
  // Hard throttle so we don't hit 429s from the backend (or Mapbox indirectly).
  NEARBY_REFRESH_COOLDOWN_MS: 15000,
  // If the user hasn't moved much, don't refetch nearby.
  NEARBY_REFRESH_DISTANCE_METERS: 100,
  DEFAULT_ZOOM: 14,
  DEFAULT_LAT: 37.7749,
  DEFAULT_LNG: -122.4194,
};

export const PAGINATION = {
  FEED_PAGE_SIZE: 20,
  SEARCH_PAGE_SIZE: 20,
  NOTIFICATIONS_PAGE_SIZE: 30,
};

export const MUSIC = {
  SYNC_INTERVAL_MS: 30000,     // poll every 30 sec
  TOP_TRACKS_LIMIT: 10,
};
