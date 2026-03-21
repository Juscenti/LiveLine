// ============================================================
// Stable pseudo-random aspect when DB has no media dimensions
// (Pinterest-style variation without identical tile heights).
// ============================================================

/** width / height */
export function deterministicAspectForPostId(id: string): number {
  let n = 2166136261;
  for (let i = 0; i < id.length; i++) {
    n ^= id.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  const t = (n >>> 0) / 2 ** 32;
  // ~0.35 (portrait) … ~1.85 (landscape) — avoids all tiles looking “square” when dims missing
  return 0.35 + t * 1.5;
}
