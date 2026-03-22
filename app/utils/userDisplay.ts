// ============================================================
// Display helpers — one place for names, handles, initials
// ============================================================

export type UserLike = {
  id?: string;
  username?: string | null;
  display_name?: string | null;
  profile_picture_url?: string | null;
  banner_url?: string | null;
};

export function getDisplayName(u: UserLike): string {
  const dn = u.display_name?.trim();
  if (dn) return dn;
  const un = u.username?.trim();
  if (un) return un;
  return 'Unknown';
}

export function getInitial(u: UserLike): string {
  return getDisplayName(u)[0]?.toUpperCase() ?? '?';
}

export function formatUserHandle(username: string | null | undefined): string {
  if (!username?.trim()) return '';
  return `@${username.trim()}`;
}

/** Stable compare for UUID strings from API vs store (feed maps `author_id` → `user_id`). */
export function isSameUserId(a?: string | null, b?: string | null): boolean {
  if (a == null || b == null) return false;
  return String(a).trim() === String(b).trim();
}
