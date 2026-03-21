// ============================================================
// config/supabase.ts — Supabase admin client (service role)
// ============================================================
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

// Service role client — bypasses RLS, backend use only
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Anon client — for verifying user JWTs
export const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY!
);

/**
 * Per-request client for mutations that must satisfy RLS (posts, likes, comments, …).
 * Use the **anon** key + the caller's Supabase JWT so PostgREST runs as `authenticated`
 * and `auth.uid()` matches policies. Pure `service_role` without impersonation can still
 * hit "new row violates RLS" when policies use `auth.uid()` and the request has no user JWT.
 * Falls back to service role + JWT if `SUPABASE_ANON_KEY` is unset.
 */
export const createSupabaseUserClient = (accessToken: string) => {
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(process.env.SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
};
