// ============================================================
// services/notificationCache.ts — offline / reload persistence
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Notification } from '@/types';

const key = (userId: string) => `liveline.notifications.v1:${userId}`;

export interface NotificationsCachePayload {
  v: 1;
  notifications: Notification[];
  cursor: string | null;
  hasMore: boolean;
}

export async function readNotificationsCache(userId: string): Promise<NotificationsCachePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NotificationsCachePayload;
    if (parsed?.v !== 1 || !Array.isArray(parsed.notifications)) return null;
    return {
      v: 1,
      notifications: parsed.notifications,
      cursor: parsed.cursor ?? null,
      hasMore: parsed.hasMore ?? false,
    };
  } catch {
    return null;
  }
}

export async function writeNotificationsCache(userId: string, payload: NotificationsCachePayload): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(payload));
  } catch {
    // non-fatal
  }
}

export async function removeNotificationsCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(userId));
  } catch {
    // ignore
  }
}
