import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { musicService } from '../services/musicService';

const router = Router();

router.get('/connect/spotify/auth-url', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return res.status(501).json({
        error: 'Spotify OAuth is not configured on the backend (set SPOTIFY_CLIENT_ID + SPOTIFY_REDIRECT_URI).',
        data: null,
      });
    }

    // We don't store state server-side in this MVP; users can still paste the `code`
    // from the redirect into the app to complete the connection.
    const state = req.userId!;
    // Needed for "currently playing" sync.
    const scope = ['user-read-email', 'user-read-private', 'user-read-playback-state', 'user-top-read'].join(' ');

    const params = new URLSearchParams();
    params.set('response_type', 'code');
    params.set('client_id', clientId);
    params.set('redirect_uri', redirectUri);
    params.set('scope', scope);
    params.set('state', state);
    // Request refresh token where supported.
    params.set('access_type', 'offline');

    const url = `https://accounts.spotify.com/authorize?${params.toString()}`;

    return res.json({ data: { url }, error: null });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? 'Unknown error', data: null });
  }
});

router.get('/connect/apple/auth-url', requireAuth, async (req: AuthRequest, res: Response) => {
  // Apple Music OAuth requires additional server-side signing (JWT) and setup.
  // Keep a UX stub so the app can show a "link" step without breaking navigation.
  const missing = !process.env.APPLE_MUSIC_TEAM_ID || !process.env.APPLE_MUSIC_KEY_ID || !process.env.APPLE_MUSIC_PRIVATE_KEY_PATH;
  if (missing) {
    return res.status(501).json({
      error: 'Apple OAuth is not configured on the backend yet (missing Apple Music env vars).',
      data: null,
    });
  }

  return res.status(501).json({
    error: 'Apple Music OAuth URL generation is not implemented in this repo yet.',
    data: null,
  });
});

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

