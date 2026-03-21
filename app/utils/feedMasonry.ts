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
  // ~0.58 (tall portrait) … ~1.15 (slightly wide)
  return 0.58 + t * 0.57;
}
