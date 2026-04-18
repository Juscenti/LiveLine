import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

const uuidSchema = z.string().uuid();

function badUuid(res: Response) {
  return res.status(400).json({ error: 'Invalid id', data: null });
}

function normalizeStatus(raw: string | null | undefined) {
  if (!raw) return 'none';
  if (raw === 'accepted') return 'accepted';
  if (raw === 'pending') return 'pending';
  if (raw === 'declined') return 'declined';
  if (raw === 'blocked') return 'blocked';
  return 'none';
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = supabaseAdmin;

  // Avoid PostgREST relationship inference on views (like `v_friends`).
  // Instead, query `friendships` directly and compute `friend_id` in JS.
  const { data: q1, error: q1Error } = await db
    .from('friendships')
    .select('id, addressee_id, created_at')
    .eq('requester_id', req.userId)
    .eq('status', 'accepted');

  if (q1Error) return res.status(500).json({ error: q1Error.message, data: null });

  const { data: q2, error: q2Error } = await db
    .from('friendships')
    .select('id, requester_id, created_at')
    .eq('addressee_id', req.userId)
    .eq('status', 'accepted');

  if (q2Error) return res.status(500).json({ error: q2Error.message, data: null });

  const rows = [
    ...(q1 ?? []).map((r: any) => ({
      id: r.id,
      friend_id: r.addressee_id,
      created_at: r.created_at,
    })),
    ...(q2 ?? []).map((r: any) => ({
      id: r.id,
      friend_id: r.requester_id,
      created_at: r.created_at,
    })),
  ];

  const friendIds = rows.map((r) => r.friend_id).filter(Boolean);
  if (friendIds.length === 0) return res.json({ data: [], error: null });

  const { data: usersData, error: usersError } = await db
    .from('users')
    .select('id, username, display_name, profile_picture_url')
    .in('id', friendIds);

  if (usersError) return res.status(500).json({ error: usersError.message, data: null });

  const byId = new Map((usersData ?? []).map((u: any) => [u.id, u]));

  const friends = rows.map((row: any) => ({
    id: row.id,
    friend_id: row.friend_id,
    created_at: row.created_at,
    users: byId.get(row.friend_id) ?? null,
  }));

  return res.json({ data: friends, error: null });
});

// Pending outgoing (I am requester) — avoid PostgREST embeds (FK hint names differ across DBs / RLS edge cases).
router.get('/outgoing', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = supabaseAdmin;
  const { data: rows, error } = await db
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .eq('requester_id', req.userId)
    .eq('status', 'pending');

  if (error) return res.status(500).json({ error: error.message, data: null });
  const ids = [...new Set((rows ?? []).map((r: { addressee_id: string }) => r.addressee_id))].filter(Boolean);
  if (ids.length === 0) return res.json({ data: [], error: null });

  const { data: usersData, error: usersError } = await db
    .from('users')
    .select('id, username, display_name, profile_picture_url')
    .in('id', ids);

  if (usersError) return res.status(500).json({ error: usersError.message, data: null });
  const byId = new Map((usersData ?? []).map((u: { id: string }) => [u.id, u]));
  const data = (rows ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    addressee: byId.get(r.addressee_id as string) ?? null,
  }));
  return res.json({ data, error: null });
});

// Incoming friend requests (must be registered BEFORE /status/:userId or "requests" is captured as a userId).
router.get('/requests', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = supabaseAdmin;
  const { data: rows, error } = await db
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .eq('addressee_id', req.userId)
    .eq('status', 'pending');

  if (error) return res.status(500).json({ error: error.message, data: null });
  const ids = [...new Set((rows ?? []).map((r: { requester_id: string }) => r.requester_id))].filter(Boolean);
  if (ids.length === 0) return res.json({ data: [], error: null });

  const { data: usersData, error: usersError } = await db
    .from('users')
    .select('id, username, display_name, profile_picture_url')
    .in('id', ids);

  if (usersError) return res.status(500).json({ error: usersError.message, data: null });
  const byId = new Map((usersData ?? []).map((u: { id: string }) => [u.id, u]));
  const data = (rows ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    requester: byId.get(r.requester_id as string) ?? null,
  }));
  return res.json({ data, error: null });
});

// Relationship status between me and a target user.
// Returns: none | accepted | pending_incoming | pending_outgoing | declined | blocked
router.get('/status/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = uuidSchema.safeParse(req.params.userId);
  if (!parsed.success) return badUuid(res);
  const targetId = parsed.data;

  const db = supabaseAdmin;
  const { data, error } = await db
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

router.post('/request/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = uuidSchema.safeParse(req.params.userId);
  if (!parsed.success) return badUuid(res);
  const db = supabaseAdmin;
  const { data, error } = await db
    .from('friendships')
    .insert({ requester_id: req.userId, addressee_id: parsed.data })
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
  const idParsed = uuidSchema.safeParse(req.params.id);
  if (!idParsed.success) return badUuid(res);
  const db = supabaseAdmin;
  const { error } = await db
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', idParsed.data)
    .eq('addressee_id', req.userId);

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data: { accepted: true }, error: null });
});

router.patch('/:id/decline', requireAuth, async (req: AuthRequest, res: Response) => {
  const idParsed = uuidSchema.safeParse(req.params.id);
  if (!idParsed.success) return badUuid(res);
  const db = supabaseAdmin;
  const { error } = await db
    .from('friendships')
    .update({ status: 'declined' })
    .eq('id', idParsed.data)
    .eq('addressee_id', req.userId);

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data: { declined: true }, error: null });
});

router.delete('/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = uuidSchema.safeParse(req.params.userId);
  if (!parsed.success) return badUuid(res);
  const targetId = parsed.data;
  const db = supabaseAdmin;
  const { error } = await db
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${req.userId},addressee_id.eq.${targetId}),` +
      `and(requester_id.eq.${targetId},addressee_id.eq.${req.userId})`
    );

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data: { removed: true }, error: null });
});

router.post('/block/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = uuidSchema.safeParse(req.params.userId);
  if (!parsed.success) return badUuid(res);
  const targetId = parsed.data;
  const db = supabaseAdmin;
  const { error } = await db
    .from('friendships')
    .update({ status: 'blocked' })
    .or(
      `and(requester_id.eq.${req.userId},addressee_id.eq.${targetId}),` +
      `and(requester_id.eq.${targetId},addressee_id.eq.${req.userId})`
    );

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data: { blocked: true }, error: null });
});

export default router;

