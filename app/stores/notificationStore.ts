import { create } from 'zustand';
import { notificationsApi } from '@/services/api';
import type { Notification } from '@/types';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  cursor: string | null;
  hasMore: boolean;
  isLoading: boolean;

  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  registerToken: (token: string, platform: string) => Promise<void>;
  incrementUnread: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  cursor: null,
  hasMore: true,
  isLoading: false,

  load: async () => {
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
    } catch {
      set({ notifications: [], cursor: null, hasMore: false, unreadCount: 0 });
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
    } catch {
      set({ hasMore: false });
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
    } catch {
      set({ notifications: prev, unreadCount: prevUnread });
    }
  },

  registerToken: async (token, platform) => {
    await notificationsApi.registerPushToken(token, platform);
  },

  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
}));

