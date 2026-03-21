// ============================================================
// Human-readable messages for failed API calls (axios / timeouts)
// ============================================================
import axios from 'axios';

function isHostedHttpsApi(): boolean {
  const u = process.env.EXPO_PUBLIC_API_URL ?? '';
  return /^https:\/\//i.test(u) && !/localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(u);
}

function devApiHint(): string {
  if (isHostedHttpsApi()) {
    return 'Check Wi‑Fi/cellular and VPN. Hosted APIs (e.g. Render) can cold‑start — wait ~30s and retry.';
  }
  return 'On a real phone, use http://YOUR_PC_LAN_IP:PORT/api in EXPO_PUBLIC_API_URL (not localhost). Restart Expo with -c after changing .env. HTTP on Android may need a dev build (not Expo Go).';
}

const API_URL_HINT = __DEV__ ? devApiHint() : 'Check your connection and try again.';

export function formatApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.message?.toLowerCase().includes('timeout')) {
      return `Request timed out. ${API_URL_HINT}`;
    }
    if (error.response?.status === 429) {
      return 'Too many requests. Wait a minute and try again.';
    }
    if (error.response?.data) {
      const d = error.response.data as Record<string, unknown>;
      const msg =
        (typeof d.error === 'string' && d.error) ||
        (typeof d.message === 'string' && d.message) ||
        (typeof d.detail === 'string' && d.detail);
      if (msg) return msg;
    }
    if (error.response == null) {
      const base = process.env.EXPO_PUBLIC_API_URL ?? '';
      const hint = base ? `\n\nAPI: ${base}` : '';
      return (
        `Can't reach the server.${hint}\n\n${API_URL_HINT}`
      );
    }
    return error.message || 'Request failed.';
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
