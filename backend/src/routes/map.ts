import { Router } from 'express';
import type { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/location', requireAuth, async (req: AuthRequest, res: Response) => {
  const { latitude, longitude, accuracy, activity_status, visibility } = req.body;
  if (!latitude || !longitude) return res.status(400).json({ error: 'lat/lng required', data: null });

  await supabaseAdmin.rpc('upsert_user_location', {
    p_user_id: req.userId,
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy: accuracy ?? null,
    p_status: activity_status ?? null,
    p_visibility: visibility ?? 'friends',
  });

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
  const { visibility } = req.body;
  await supabaseAdmin.from('locations').update({ visibility }).eq('user_id', req.userId);
  return res.json({ data: { updated: true }, error: null });
});

export default router;

