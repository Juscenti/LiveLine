// ============================================================
// stores/feedStore.ts — Moment feed state
// ============================================================
import { create } from 'zustand';
import { postsApi } from '@/services/api';
import type { FeedPost } from '@/types';

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
  prependPost: (post: FeedPost) => void;
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
        posts: data.data,
        cursor: data.cursor,
        hasMore: data.has_more,
      });
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
        posts: [...s.posts, ...data.data],
        cursor: data.cursor,
        hasMore: data.has_more,
      }));
    } finally {
      set({ isLoading: false });
    }
  },

  refresh: async () => {
    set({ isRefreshing: true, cursor: null, hasMore: true });
    try {
      const { data } = await postsApi.getFeed();
      set({ posts: data.data, cursor: data.cursor, hasMore: data.has_more });
    } finally {
      set({ isRefreshing: false });
    }
  },

  likePost: async (postId) => {
    // Optimistic update
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId
          ? { ...p, like_count: p.like_count + 1, user_has_liked: true }
          : p
      ),
    }));
    try {
      await postsApi.like(postId);
    } catch {
      // Rollback
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === postId
            ? { ...p, like_count: p.like_count - 1, user_has_liked: false }
            : p
        ),
      }));
    }
  },

  unlikePost: async (postId) => {
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId
          ? { ...p, like_count: Math.max(p.like_count - 1, 0), user_has_liked: false }
          : p
      ),
    }));
    try {
      await postsApi.unlike(postId);
    } catch {
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === postId
            ? { ...p, like_count: p.like_count + 1, user_has_liked: true }
            : p
        ),
      }));
    }
  },

  removePost: (postId) =>
    set((s) => ({ posts: s.posts.filter((p) => p.id !== postId) })),

  prependPost: (post) =>
    set((s) => ({ posts: [post, ...s.posts] })),
}));
