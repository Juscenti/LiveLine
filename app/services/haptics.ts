// ============================================================
// services/haptics.ts — Haptics that respect the user's master toggle.
// ============================================================
import * as Haptics from 'expo-haptics';
import { usePrefsStore } from '@/stores/prefsStore';

function enabled(): boolean {
  return usePrefsStore.getState().haptics;
}

export function selectionAsync() {
  if (!enabled()) return;
  void Haptics.selectionAsync();
}

export function impactAsync(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (!enabled()) return;
  void Haptics.impactAsync(style);
}

export function notificationAsync(type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) {
  if (!enabled()) return;
  void Haptics.notificationAsync(type);
}

export { ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';
