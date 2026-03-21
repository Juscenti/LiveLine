import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

const visibilitySchema = z.enum(['public', 'friends', 'private']);

router.post('/location', requireAuth, async (req: AuthRequest, res: Response) => {
  const { latitude, longitude, accuracy, activity_status, visibility } = req.body as Record<string, unknown>;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat/lng required', data: null });
  }

  let vis: 'public' | 'friends' | 'private' = 'friends';
  if (visibility !== undefined && visibility !== null) {
    const v = visibilitySchema.safeParse(visibility);
    if (!v.success) return res.status(400).json({ error: 'Invalid visibility', data: null });
    vis = v.data;
  }

  const { error } = await supabaseAdmin.rpc('upsert_user_location', {
    p_user_id: req.userId,
    p_latitude: lat,
    p_longitude: lng,
    p_accuracy: accuracy ?? null,
    p_status: activity_status ?? null,
    p_visibility: vis,
  });

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data: { updated: true }, error: null });
});

router.get('/nearby', requireAuth, async (req: AuthRequest, res: Response) => {
  const { lat, lng, radius = 5000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat/lng required', data: null });

  const { data, error } = await supabaseAdmin.rpc('get_nearby_friends', {
    p_user_id: req.userId,
    p_latitude: Number(lat),
    p_longitude: Number(lng),
    p_radius_meters: Number(radius),
  });

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data, error: null });
});

router.patch('/visibility', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = visibilitySchema.safeParse(req.body?.visibility);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid visibility', data: null });

  const { error } = await supabaseAdmin
    .from('locations')
    .update({ visibility: parsed.data })
    .eq('user_id', req.userId);
  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data: { updated: true }, error: null });
});

export default router;

