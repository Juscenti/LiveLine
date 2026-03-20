import { Router } from 'express';
import type { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

function normalizeStatus(raw: string | null | undefined) {
  if (!raw) return 'none';
  if (raw === 'accepted') return 'accepted';
  if (raw === 'pending') return 'pending';
  if (raw === 'declined') return 'declined';
  if (raw === 'blocked') return 'blocked';
  return 'none';
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  // Avoid PostgREST relationship inference on `v_friends` (a view).
  // Instead: fetch friend ids from the view, then fetch users explicitly.
  const { data: vfData, error: vfError } = await supabaseAdmin
    .from('v_friends')
    .select('id, friend_id, created_at')
    .eq('user_id', req.userId);

  if (vfError) return res.status(500).json({ error: vfError.message, data: null });

  const friendIds = (vfData ?? []).map((row: any) => row.friend_id).filter(Boolean);
  if (friendIds.length === 0) return res.json({ data: [], error: null });

  const { data: usersData, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, username, display_name, profile_picture_url')
    .in('id', friendIds);

  if (usersError) return res.status(500).json({ error: usersError.message, data: null });

  const byId = new Map((usersData ?? []).map((u: any) => [u.id, u]));

  // Match what the mobile client expects:
  // - `friend_id` for remove/delete
  // - nested `users` object for display fields
  const friends = (vfData ?? []).map((row: any) => ({
    id: row.id,
    friend_id: row.friend_id,
    created_at: row.created_at,
    users: byId.get(row.friend_id) ?? null,
  }));

  return res.json({ data: friends, error: null });
});

// Pending outgoing requests (where I am the requester)
router.get('/outgoing', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('*, addressee:users!addressee_id(id, username, display_name, profile_picture_url)')
    .eq('requester_id', req.userId)
    .eq('status', 'pending');

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data, error: null });
});

// Relationship status between me and a target user.
// Returns: none | accepted | pending_incoming | pending_outgoing | declined | blocked
router.get('/status/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  const targetId = req.params.userId;

  const { data, error } = await supabaseAdmin
    .from('friendships')
    .select('*')
    .or(
      `and(requester_id.eq.${req.userId},addressee_id.eq.${targetId}),` +
      `and(requester_id.eq.${targetId},addressee_id.eq.${req.userId})`
    )
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message, data: null });
  if (!data) return res.json({ data: { status: 'none', friendshipId: null }, error: null });

  const status = data.status;
  const isIncoming = data.addressee_id === req.userId && data.requester_id === targetId;
  const isOutgoing = data.requester_id === req.userId && data.addressee_id === targetId;

  if (status === 'accepted') return res.json({ data: { status: 'accepted', friendshipId: data.id }, error: null });

  if (status === 'pending') {
    if (isIncoming) return res.json({ data: { status: 'pending_incoming', friendshipId: data.id }, error: null });
    if (isOutgoing) return res.json({ data: { status: 'pending_outgoing', friendshipId: data.id }, error: null });
    return res.json({ data: { status: 'pending', friendshipId: data.id }, error: null });
  }

  return res.json({ data: { status: normalizeStatus(status), friendshipId: data.id }, error: null });
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

  if (error) {
    // Unique(requester_id, addressee_id) can throw on duplicates.
    if ((error as any)?.code === '23505') {
      return res.status(409).json({ error: 'Friend request already exists', data: null });
    }
    return res.status(500).json({ error: error.message, data: null });
  }
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

router.post('/block/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { error } = await supabaseAdmin
    .from('friendships')
    .update({ status: 'blocked' })
    .or(
      `and(requester_id.eq.${req.userId},addressee_id.eq.${req.params.userId}),` +
      `and(requester_id.eq.${req.params.userId},addressee_id.eq.${req.userId})`
    );

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data: { blocked: true }, error: null });
});

export default router;

