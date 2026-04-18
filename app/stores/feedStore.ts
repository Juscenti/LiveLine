// ============================================================
// stores/feedStore.ts — Moment feed state
// ============================================================
import { create } from 'zustand';
import { postsApi } from '@/services/api';
import type { FeedPost } from '@/types';

function positiveMediaDim(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Exported so single-post screens use the same media_width/height rules as the feed */
export function normalizeFeedPost(raw: Record<string, unknown>): FeedPost {
  return {
    ...raw,
    id: String(raw.post_id ?? raw.id ?? ''),
    user_id: String(raw.user_id ?? raw.author_id ?? ''),
    media_width: positiveMediaDim(raw.media_width),
    media_height: positiveMediaDim(raw.media_height),
    author:
      (raw.author as FeedPost['author']) ??
      ({
        id: raw.author_id,
        username: raw.username,
        display_name: raw.display_name,
        profile_picture_url: raw.profile_picture_url,
      } as FeedPost['author']),
  } as FeedPost;
}

function normalizeFeedPosts(rows: unknown[] | undefined): FeedPost[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => normalizeFeedPost(r as Record<string, unknown>));
}

interface FeedState {
  posts: FeedPost[];
  cursor: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isRefreshing: boolean;

  loadFeed: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  likePost: (postId: string) => Promise<void>;
  unlikePost: (postId: string) => Promise<void>;
  removePost: (postId: string) => void;
  /** Soft-delete on server, then drop from local feed */
  deletePost: (postId: string) => Promise<void>;
  prependPost: (post: FeedPost) => void;
  reset: () => void;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  cursor: null,
  hasMore: true,
  isLoading: false,
  isRefreshing: false,

  loadFeed: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const { data } = await postsApi.getFeed();
      set({
        posts: normalizeFeedPosts(data?.data),
        cursor: data?.cursor ?? null,
        hasMore: data?.has_more ?? false,
      });
    } catch {
      set({ posts: [], cursor: null, hasMore: false });
    } finally {
      set({ isLoading: false });
    }
  },

  loadMore: async () => {
    const { isLoading, hasMore, cursor } = get();
    if (isLoading || !hasMore) return;
    set({ isLoading: true });
    try {
      const { data } = await postsApi.getFeed(cursor ?? undefined);
      set((s) => ({
        posts: [...s.posts, ...normalizeFeedPosts(data?.data)],
        cursor: data?.cursor ?? null,
        hasMore: data?.has_more ?? false,
      }));
    } catch {
      set({ hasMore: false });
    } finally {
      set({ isLoading: false });
    }
  },

  refresh: async () => {
    set({ isRefreshing: true, cursor: null, hasMore: true });
    try {
      const { data } = await postsApi.getFeed();
      set({
        posts: normalizeFeedPosts(data?.data),
        cursor: data?.cursor ?? null,
        hasMore: data?.has_more ?? false,
      });
    } catch {
      // Keep existing posts if refresh fails.
    } finally {
      set({ isRefreshing: false });
    }
  },

  likePost: async (postId) => {
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId
          ? { ...p, like_count: p.like_count + 1, user_has_liked: true }
          : p,
      ),
    }));
    try {
      await postsApi.like(postId);
    } catch {
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === postId
            ? { ...p, like_count: p.like_count - 1, user_has_liked: false }
            : p,
        ),
      }));
    }
  },

  unlikePost: async (postId) => {
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId
          ? { ...p, like_count: Math.max(p.like_count - 1, 0), user_has_liked: false }
          : p,
      ),
    }));
    try {
      await postsApi.unlike(postId);
    } catch {
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === postId
            ? { ...p, like_count: p.like_count + 1, user_has_liked: true }
            : p,
        ),
      }));
    }
  },

  removePost: (postId) =>
    set((s) => ({ posts: s.posts.filter((p) => p.id !== postId) })),

  deletePost: async (postId) => {
    try {
      await postsApi.delete(postId);
      set((s) => ({ posts: s.posts.filter((p) => p.id !== postId) }));
    } catch {
      throw new Error('Could not delete post.');
    }
  },

  prependPost: (post) =>
    set((s) => ({
      posts: [normalizeFeedPost(post as unknown as Record<string, unknown>), ...s.posts],
    })),

  reset: () => set({ posts: [], cursor: null, hasMore: true, isLoading: false, isRefreshing: false }),
}));
