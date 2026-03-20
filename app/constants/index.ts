// ============================================================
// constants/index.ts
// ============================================================

export const COLORS = {
  // Brand
  accent: '#00FF94',       // neon green — primary CTA
  accentDim: '#00CC75',
  accentMuted: '#00FF9420',

  // Backgrounds
  bg: '#0A0A0A',
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
};

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

export const MAP = {
  DEFAULT_RADIUS_METERS: 5000,
  UPDATE_INTERVAL_MS: 15000,   // 15 sec throttle
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
