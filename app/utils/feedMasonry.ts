// ============================================================
// Masonry tile aspect — full spectrum (portrait ↔ square ↔ wide)
// When DB has media_width/height we use exact pixels; otherwise a
// stable, per-post pseudo-random ratio with log-uniform spread so
// tiles aren’t stuck in “only square vs horizontal” buckets.
// ============================================================
import type { FeedPost } from '@/types';

/**
 * width / height from real pixel dimensions.
 * Near-square images (e.g. 130×120) snap to 1:1 for layout so tiles read as “even”
 * without fighting portrait / landscape, which stay as-is outside this band.
 */
/** ~±13% around 1:1 — “almost square” reads as square without snapping true 4:5 portrait */
const NEAR_SQUARE_EPS = 0.13;

export function normalizeAspectFromPixels(widthPx: number, heightPx: number): number {
  if (widthPx <= 0 || heightPx <= 0) return 1;
  const ar = widthPx / heightPx;
  if (Math.abs(ar - 1) <= NEAR_SQUARE_EPS) return 1;
  return ar;
}

/** Stable [0, 1) from string; salt yields an independent second stream */
function hash01(id: string, salt: number): number {
  let n = 2166136261 ^ (salt * 0x9e3779b1);
  for (let i = 0; i < id.length; i++) {
    n ^= id.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return (n >>> 0) / 2 ** 32;
}

/**
 * width / height when dimensions are unknown.
 * Log-uniform from ~ultra-portrait through square to ~ultra-wide so every
 * band (vertical, near-square, horizontal, panoramic) appears over the feed.
 */
export function deterministicAspectForPostId(id: string): number {
  const t = hash01(id, 0);
  const u = hash01(id, 1);
  const v = hash01(id, 2);

  const MIN = 0.11; // very tall portrait (≈ 1 : 9 height bias)
  const MAX = 5.8; // very wide landscape
  const logSpan = Math.log(MAX / MIN);
  const base = MIN * Math.exp(t * logSpan);

  // Secondary micro-wobble so adjacent ids don’t look “quantized”
  const jitter = 0.88 + u * 0.24;
  // Tertiary fine grain for in-between shapes
  const fine = 0.97 + v * 0.06;

  return Math.min(MAX, Math.max(MIN, base * jitter * fine));
}

function positiveDim(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}

/** width / height for layout (feed tile height, post detail frame) */
export function getPostMediaAspectRatio(
  post: Pick<FeedPost, 'id' | 'media_width' | 'media_height'>,
): number {
  const w = positiveDim(post.media_width ?? null);
  const h = positiveDim(post.media_height ?? null);
  if (w != null && h != null) {
    return normalizeAspectFromPixels(w, h);
  }
  return deterministicAspectForPostId(post.id);
}
