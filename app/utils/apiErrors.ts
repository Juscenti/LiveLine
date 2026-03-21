// ============================================================
// Human-readable messages for failed API calls (axios / timeouts)
// ============================================================
import axios from 'axios';

const API_URL_HINT = __DEV__
  ? 'On a real phone, set EXPO_PUBLIC_API_URL to http://YOUR_PC_LAN_IP:PORT/api (not localhost). Restart Expo with -c after changing .env. HTTP on Android may require a dev build (not Expo Go).'
  : 'Check your connection and try again.';

export function formatApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.message?.toLowerCase().includes('timeout')) {
      return `Request timed out. ${API_URL_HINT}`;
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
