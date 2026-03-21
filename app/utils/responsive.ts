// ============================================================
// Responsive layout — scale from screen width (phones → tablets)
// Prefer fractions of width over fixed px so UI scales across devices.
// ============================================================
import { useWindowDimensions } from 'react-native';

/** Reference phone width for gentle typography scaling */
const BASE_WIDTH = 390;

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  /** ~0.9–1.4: avoids huge type on tablets but still scales up slightly */
  const scale = Math.min(Math.max(width / BASE_WIDTH, 0.88), 1.38);

  const padH = width * 0.04;
  const padV = height * 0.012;
  const gutter = width * 0.023;
  /** Cap feed width on large tablets (centered column) */
  const maxFeedWidth = Math.min(width, 720);
  const isTablet = width >= 600;

  return {
    width,
    height,
    scale,
    padH,
    padV,
    gutter,
    maxFeedWidth,
    isTablet,
    /** Percent of screen width → px */
    wp: (pct: number) => (width * pct) / 100,
    /** Percent of screen height → px */
    hp: (pct: number) => (height * pct) / 100,
  };
}
