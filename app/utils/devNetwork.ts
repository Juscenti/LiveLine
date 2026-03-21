// ============================================================
// Dev network — Android emulator cannot use localhost to reach the host PC.
// Physical devices are unchanged (use your LAN IP in .env on device).
// ============================================================
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const EMULATOR_HOST = '10.0.2.2';

/**
 * Rewrites localhost / 127.0.0.1 to the AVD host loopback (10.0.2.2).
 * Only when running the Android emulator — not on physical phones.
 */
export function rewriteLocalhostForAndroidEmulator(url: string): string {
  if (Platform.OS !== 'android') return url;
  if (Constants.isDevice) return url;

  try {
    const u = new URL(url);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      u.hostname = EMULATOR_HOST;
      return u.toString();
    }
  } catch {
    return url;
  }
  return url;
}
