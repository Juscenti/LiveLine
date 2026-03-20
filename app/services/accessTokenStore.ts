// In-memory access token holder.
// Why: Supabase client's `setSession` can hang in some environments. We still
// need the axios interceptor to attach the backend-issued JWT so auth-protected
// API requests work.

let accessToken: string | null = null;

export function setAccessToken(token: string) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

