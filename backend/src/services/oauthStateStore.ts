import { randomBytes } from 'crypto';

const TTL_MS = 60 * 60 * 1000; // 1 hour - increased from 10 minutes
const store = new Map<string, { userId: string; exp: number }>();

function prune() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.exp < now) store.delete(k);
  }
}

export function issueSpotifyOAuthState(userId: string): string {
  prune();
  const state = randomBytes(24).toString('hex');
  store.set(state, { userId, exp: Date.now() + TTL_MS });
  return state;
}

export function consumeSpotifyOAuthState(state: string, userId: string): boolean {
  prune();
  const row = store.get(state);
  if (!row || row.userId !== userId) return false;
  store.delete(state);
  return true;
}
