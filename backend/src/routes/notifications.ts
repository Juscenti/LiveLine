import { Router } from 'express';
import type { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const cursor = req.query.cursor as string | undefined;

  let query = supabaseAdmin
    .from('notifications')
    .select('*, actor:users!actor_id(id, username, display_name, profile_picture_url)')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message, data: null });

  return res.json({
    data,
    cursor: data?.[data.length - 1]?.created_at ?? null,
    has_more: (data?.length ?? 0) === 30,
    error: null,
  });
});

router.patch('/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  await supabaseAdmin
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.userId);

  return res.json({ data: { read: true }, error: null });
});

router.post('/read-all', requireAuth, async (req: AuthRequest, res: Response) => {
  await supabaseAdmin.rpc('mark_all_notifications_read', { p_user_id: req.userId });
  return res.json({ data: { read: true }, error: null });
});

router.post('/push-token', requireAuth, async (req: AuthRequest, res: Response) => {
  const { token, platform } = req.body as { token?: string; platform?: string };
  if (!token || !platform) return res.status(400).json({ error: 'token and platform required', data: null });

  await supabaseAdmin
    .from('push_tokens')
    .upsert({ user_id: req.userId, token, platform }, { onConflict: 'user_id,token' });

  return res.json({ data: { registered: true }, error: null });
});

export default router;

