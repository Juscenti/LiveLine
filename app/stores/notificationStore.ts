import { create } from 'zustand';
import { notificationsApi } from '@/services/api';
import {
  readNotificationsCache,
  writeNotificationsCache,
  removeNotificationsCache,
} from '@/services/notificationCache';
import type { Notification } from '@/types';

type NotificationStateSnapshot = {
  notifications: Notification[];
  cursor: string | null;
  hasMore: boolean;
};

async function persistForUser(userId: string, state: NotificationStateSnapshot) {
  await writeNotificationsCache(userId, {
    v: 1,
    notifications: state.notifications,
    cursor: state.cursor,
    hasMore: state.hasMore,
  });
}

/** Which user the in-memory list + AsyncStorage cache belong to (for persistence). */
let notificationsCacheOwnerId: string | null = null;

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  cursor: string | null;
  hasMore: boolean;
  isLoading: boolean;

  /** Restore last good list from disk (same session / after reload). */
  hydrateFromCache: (userId: string) => Promise<void>;
  /** Clear disk for this account (call on logout). */
  clearCachedForUser: (userId: string) => Promise<void>;
  reset: () => void;

  load: (userId?: string | null) => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  registerToken: (token: string, platform: string) => Promise<void>;
  incrementUnread: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => {
  const persistSnapshot = async () => {
    const uid = notificationsCacheOwnerId;
    if (!uid) return;
    const s = get();
    await persistForUser(uid, {
      notifications: s.notifications,
      cursor: s.cursor,
      hasMore: s.hasMore,
    });
  };

  return {
    notifications: [],
    unreadCount: 0,
    cursor: null,
    hasMore: true,
    isLoading: false,

    hydrateFromCache: async (userId) => {
      notificationsCacheOwnerId = userId;
      const cached = await readNotificationsCache(userId);
      if (!cached?.notifications.length) return;
      set({
        notifications: cached.notifications,
        cursor: cached.cursor,
        hasMore: cached.hasMore,
        unreadCount: cached.notifications.filter((n) => !n.is_read).length,
      });
    },

    clearCachedForUser: async (userId) => {
      await removeNotificationsCache(userId);
    },

    reset: () => {
      notificationsCacheOwnerId = null;
      set({
        notifications: [],
        unreadCount: 0,
        cursor: null,
        hasMore: true,
        isLoading: false,
      });
    },

    load: async (userId) => {
      if (userId) notificationsCacheOwnerId = userId;
      set({ isLoading: true });
      try {
        const { data } = await notificationsApi.getAll();
        const rows = Array.isArray(data?.data) ? data.data : [];
        set({
          notifications: rows,
          cursor: data?.cursor ?? null,
          hasMore: data?.has_more ?? false,
          unreadCount: rows.filter((n: Notification) => !n.is_read).length,
        });
        if (notificationsCacheOwnerId) await persistSnapshot();
      } catch {
        // Keep existing in-memory list (and any hydrated cache) — don't wipe on network error.
      } finally {
        set({ isLoading: false });
      }
    },

    loadMore: async () => {
      const { isLoading, hasMore, cursor } = get();
      if (isLoading || !hasMore) return;
      set({ isLoading: true });
      try {
        const { data } = await notificationsApi.getAll(cursor ?? undefined);
        const next = Array.isArray(data?.data) ? data.data : [];
        set((s) => ({
          notifications: [...s.notifications, ...next],
          cursor: data?.cursor ?? null,
          hasMore: data?.has_more ?? false,
        }));
        await persistSnapshot();
      } catch {
        // leave hasMore as-is so user can retry scroll
      } finally {
        set({ isLoading: false });
      }
    },

    markRead: async (id) => {
      const prev = get().notifications;
      const prevUnread = get().unreadCount;
      set((s) => ({
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
        unreadCount: Math.max(s.unreadCount - 1, 0),
      }));
      try {
        await notificationsApi.markRead(id);
        await persistSnapshot();
      } catch {
        set({ notifications: prev, unreadCount: prevUnread });
      }
    },

    markAllRead: async () => {
      const prev = get().notifications;
      const prevUnread = get().unreadCount;
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
        unreadCount: 0,
      }));
      try {
        await notificationsApi.markAllRead();
        await persistSnapshot();
      } catch {
        set({ notifications: prev, unreadCount: prevUnread });
      }
    },

    registerToken: async (token, platform) => {
      await notificationsApi.registerPushToken(token, platform);
    },

    incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  };
});
