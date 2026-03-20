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
      set({
        notifications: data.data,
        cursor: data.cursor,
        hasMore: data.has_more,
        unreadCount: data.data.filter((n: Notification) => !n.is_read).length,
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
      const { data } = await notificationsApi.getAll(cursor ?? undefined);
      set((s) => ({
        notifications: [...s.notifications, ...data.data],
        cursor: data.cursor,
        hasMore: data.has_more,
      }));
    } finally {
      set({ isLoading: false });
    }
  },

  markRead: async (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      unreadCount: Math.max(s.unreadCount - 1, 0),
    }));
    await notificationsApi.markRead(id);
  },

  markAllRead: async () => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
    await notificationsApi.markAllRead();
  },

  registerToken: async (token, platform) => {
    await notificationsApi.registerPushToken(token, platform);
  },

  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
}));

