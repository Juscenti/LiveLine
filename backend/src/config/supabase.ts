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
 * Uses the **service role** key + the caller's Supabase JWT in `Authorization`.
 * Do **not** use `SUPABASE_ANON_KEY` here — a wrong/missing anon key causes
 * "Invalid API key" for every request; service role is always valid.
 */
export const createSupabaseUserClient = (accessToken: string) => {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
};
