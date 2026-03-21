// ============================================================
// config/supabase.ts — Supabase admin client (service role)
// ============================================================
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing SUPABASE_ANON_KEY — required for RLS-scoped requests (same publishable key as the mobile app)',
  );
}

// Service role client — bypasses RLS, backend use only
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Anon client — same key as EXPO_PUBLIC_SUPABASE_ANON_KEY on clients
export const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Per-request client for PostgREST calls that must enforce RLS (`auth.uid()` in policies).
 * Uses the **anon** key + the user's access token in `Authorization`.
 * The service role bypasses RLS; do not use it for inserts/updates that rely on `auth.uid()`.
 */
export const createSupabaseUserClient = (accessToken: string) => {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
};
