// ============================================================
// Ensure public.users row exists for a Supabase Auth user.
// Normally created by DB trigger on auth.users; this covers
// missing triggers, legacy accounts, or auth-only signups.
// ============================================================
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';

function randomSuffix(len = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function defaultUsernameFromEmail(email: string): string {
  const local = email.split('@')[0] || 'user';
  const base =
    local
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, '')
      .slice(0, 20) || 'user';
  return `${base}_${randomSuffix()}`.slice(0, 30);
}

function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] || 'user';
  return local.length > 50 ? local.slice(0, 50) : local;
}

/**
 * Returns public.users.id for this auth user, inserting a row if missing.
 */
export async function getOrCreatePublicUserProfile(authUser: User): Promise<{ id: string } | null> {
  const { data: existingRows } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .order('created_at', { ascending: true })
    .limit(1);

  const existing = existingRows?.[0] ?? null;
  if (existing?.id) return { id: existing.id };

  const email = (authUser.email ?? '').trim().toLowerCase();
  const emailForRow =
    email || `auth-${authUser.id.replace(/-/g, '')}@users.liveline.placeholder`;

  for (let attempt = 0; attempt < 10; attempt++) {
    const username = defaultUsernameFromEmail(emailForRow).toLowerCase();

    const { data: inserted, error } = await supabaseAdmin
      .from('users')
      .insert({
        auth_id: authUser.id,
        email: emailForRow,
        username,
        display_name: displayNameFromEmail(emailForRow),
      })
      .select('id')
      .single();

    if (!error && inserted?.id) return { id: inserted.id };

    // Race: peer request inserted same auth_id — return the oldest row
    const { data: racedRows } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', authUser.id)
      .order('created_at', { ascending: true })
      .limit(1);
    const raced = racedRows?.[0] ?? null;
    if (raced?.id) return { id: raced.id };

    // Username collision — retry with new suffix
    if (error?.code === '23505') continue;

    return null;
  }

  return null;
}
