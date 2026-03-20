import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { musicService } from '../services/musicService';

const router = Router();

router.post('/connect/spotify', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await musicService.connectSpotify(req.userId!, req.body.code);
    return res.json({ data: { connected: true }, error: null });
  } catch (e: any) {
    return res.status(500).json({ error: e.message, data: null });
  }
});

router.post('/connect/apple', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await musicService.connectAppleMusic(req.userId!, req.body.token);
    return res.json({ data: { connected: true }, error: null });
  } catch (e: any) {
    return res.status(500).json({ error: e.message, data: null });
  }
});

router.post('/connect/soundcloud', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await musicService.connectSoundCloud(req.userId!, req.body.code);
    return res.json({ data: { connected: true }, error: null });
  } catch (e: any) {
    return res.status(500).json({ error: e.message, data: null });
  }
});

router.delete('/connect/:platform', requireAuth, async (req: AuthRequest, res: Response) => {
  await supabaseAdmin
    .from('music_connections')
    .update({ is_active: false })
    .eq('user_id', req.userId)
    .eq('platform', req.params.platform);

  return res.json({ data: { disconnected: true }, error: null });
});

router.get('/:userId/now-playing', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('music_activity')
    .select('*')
    .eq('user_id', req.params.userId)
    .eq('is_currently_playing', true)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data, error: null });
});

router.get('/:userId/top-tracks', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('user_top_tracks')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('rank', { ascending: true });

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data, error: null });
});

router.post('/sync', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const track = await musicService.syncNowPlaying(req.userId!);
    return res.json({ data: track, error: null });
  } catch (e: any) {
    return res.status(500).json({ error: e.message, data: null });
  }
});

export default router;

