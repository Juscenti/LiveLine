import { Router } from 'express';
import type { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('v_friends')
    .select('friend_id, users!friend_id(id, username, display_name, profile_picture_url)')
    .eq('user_id', req.userId);

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data, error: null });
});

router.get('/requests', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('*, requester:users!requester_id(id, username, display_name, profile_picture_url)')
    .eq('addressee_id', req.userId)
    .eq('status', 'pending');

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data, error: null });
});

router.post('/request/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('friendships')
    .insert({ requester_id: req.userId, addressee_id: req.params.userId })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.status(201).json({ data, error: null });
});

router.patch('/:id/accept', requireAuth, async (req: AuthRequest, res: Response) => {
  const { error } = await supabaseAdmin
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', req.params.id)
    .eq('addressee_id', req.userId);

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data: { accepted: true }, error: null });
});

router.patch('/:id/decline', requireAuth, async (req: AuthRequest, res: Response) => {
  const { error } = await supabaseAdmin
    .from('friendships')
    .update({ status: 'declined' })
    .eq('id', req.params.id)
    .eq('addressee_id', req.userId);

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data: { declined: true }, error: null });
});

router.delete('/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  await supabaseAdmin
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${req.userId},addressee_id.eq.${req.params.userId}),` +
      `and(requester_id.eq.${req.params.userId},addressee_id.eq.${req.userId})`
    );

  return res.json({ data: { removed: true }, error: null });
});

export default router;

