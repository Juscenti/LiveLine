// ============================================================
// utils/useReduceMotion.ts — Combines OS reduce-motion with the user pref.
// ============================================================
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { usePrefsStore } from '@/stores/prefsStore';

export function useReduceMotion(): boolean {
  const userPref = usePrefsStore((s) => s.reduceMotion);
  const [osPref, setOsPref] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => {
      if (alive) setOsPref(!!v);
    });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setOsPref(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  return userPref || osPref;
}
