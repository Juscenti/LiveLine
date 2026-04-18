import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin, createSupabaseUserClient } from '../config/supabase';
import { requireAuth, upload } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

// Search users by fuzzy username/display_name (trigram-based)
router.get('/search', requireAuth, async (req: AuthRequest, res: Response) => {
  const q = (req.query.q as string)?.trim();
  if (!q) return res.json({ data: [], error: null });

  const { data, error } = await supabaseAdmin.rpc('search_users', {
    p_query: q,
    p_limit: 20,
    p_offset: Number(req.query.offset ?? 0),
  });

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data, error: null });
});

// Current user profile — must be before /:userId or "me" is treated as a user id.
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, username, display_name, bio, profile_picture_url, banner_url, created_at')
    .eq('id', req.userId)
    .single();

  if (error) return res.status(404).json({ error: 'User not found', data: null });
  return res.json({ data, error: null });
});

// Get any user profile (public profile discovery is filtered by SQL/RLS)
router.get('/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, username, display_name, bio, profile_picture_url, banner_url, created_at')
    .eq('id', req.params.userId)
    .single();

  if (error) return res.status(404).json({ error: 'User not found', data: null });
  return res.json({ data, error: null });
});

// Update own profile
router.patch('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    display_name: z.string().max(50).optional(),
    bio: z.string().max(300).optional(),
    username: z.string().min(3).max(30).optional(),
    default_location_visibility: z.enum(['public', 'friends', 'private']).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation error', data: null });

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(parsed.data)
    .eq('id', req.userId)
    // `single()` throws PGRST116 ("Cannot coerce the result to a single JSON object")
    // if the underlying PostgREST returns an empty array or unexpected shape.
    // `maybeSingle()` is safer for update responses.
    .select('id, username, display_name, bio, profile_picture_url, banner_url, updated_at')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message, data: null });
  if (!data) return res.status(404).json({ error: 'User not found', data: null });
  return res.json({ data, error: null });
});

// Upload avatar (profile_picture_url)
router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file', data: null });

  // Use userAuthId (= auth.uid() in JWT) so the folder matches the standard storage RLS policy.
  const key = `${req.userAuthId}/avatar.jpg`;
  const userClient = createSupabaseUserClient(req.accessToken!);
  const { error: uploadErr } = await userClient.storage
    .from('avatars')
    .upload(key, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

  if (uploadErr) return res.status(500).json({ error: uploadErr.message, data: null });

  const { data: { publicUrl } } = supabaseAdmin.storage.from('avatars').getPublicUrl(key);
  const { error: dbErr } = await supabaseAdmin
    .from('users')
    .update({ profile_picture_url: publicUrl })
    .eq('id', req.userId);

  if (dbErr) return res.status(500).json({ error: dbErr.message, data: null });

  return res.json({ data: { url: publicUrl }, error: null });
});

// Upload banner (banner_url)
router.post('/me/banner', requireAuth, upload.single('banner'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file', data: null });

  const key = `${req.userAuthId}/banner.jpg`;
  const userClient = createSupabaseUserClient(req.accessToken!);
  const { error: uploadErr } = await userClient.storage
    .from('banners')
    .upload(key, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

  if (uploadErr) return res.status(500).json({ error: uploadErr.message, data: null });

  const { data: { publicUrl } } = supabaseAdmin.storage.from('banners').getPublicUrl(key);
  const { error: dbErr } = await supabaseAdmin
    .from('users')
    .update({ banner_url: publicUrl })
    .eq('id', req.userId);

  if (dbErr) return res.status(500).json({ error: dbErr.message, data: null });

  return res.json({ data: { url: publicUrl }, error: null });
});

// Update interests
router.put('/me/interests', requireAuth, async (req: AuthRequest, res: Response) => {
  const { interest_ids } = req.body as { interest_ids: number[] };

  await supabaseAdmin.from('user_interests').delete().eq('user_id', req.userId);

  if (interest_ids?.length) {
    await supabaseAdmin.from('user_interests').insert(
      interest_ids.map((id) => ({ user_id: req.userId, interest_id: id })),
    );
  }

  return res.json({ data: { updated: true }, error: null });
});

// Get user posts (used from profile screen)
router.get('/:userId/posts', requireAuth, async (req: AuthRequest, res: Response) => {
  const cursor = req.query.cursor as string | undefined;

  let query = supabaseAdmin
    .from('posts')
    .select('*')
    .eq('user_id', req.params.userId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(20);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message, data: null });

  return res.json({
    data,
    cursor: data?.[data.length - 1]?.created_at ?? null,
    has_more: (data?.length ?? 0) === 20,
    error: null,
  });
});

export default router;

