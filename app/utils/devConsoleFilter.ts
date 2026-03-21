// ============================================================
// Metro still prints LogBox-ignored messages; trim known noise in dev.
// ============================================================
import { Platform } from 'react-native';

let installed = false;

export function installDevConsoleNetworkFilter() {
  if (!__DEV__ || installed) return;
  installed = true;

  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const head = args[0];
    const s =
      typeof head === 'string'
        ? head
        : head instanceof Error
          ? head.message + (head.name ? ` ${head.name}` : '')
          : '';
    const isNetFail =
      s.includes('Network request failed') ||
      s.includes('AuthRetryableFetchError') ||
      (head instanceof TypeError && head.message === 'Network request failed');
    if (isNetFail) return;
    origError.apply(console, args as [unknown, ...unknown[]]);
  };

  // Optional: same for warn (some libs log there)
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const head = args[0];
    const s = typeof head === 'string' ? head : '';
    if (Platform.OS !== 'web' && s.includes('Network request failed')) return;
    origWarn.apply(console, args as [unknown, ...unknown[]]);
  };
}
