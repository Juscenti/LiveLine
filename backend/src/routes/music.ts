import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { musicService } from '../services/musicService';
import { issueSpotifyOAuthState } from '../services/oauthStateStore';

const router = Router();

// Register before any `/:userId/...` routes so `connect` is never captured as a user id.
router.get('/connect/platforms', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('music_connections')
    .select('platform')
    .eq('user_id', req.userId)
    .eq('is_active', true);

  if (error) return res.status(500).json({ error: error.message, data: null });
  const platforms = (data ?? []).map((row) => row.platform).filter(Boolean);
  return res.json({ data: { platforms }, error: null });
});

function isAllowedSpotifyRedirectUri(uri: string): boolean {
  // Allow app deep links + Expo dev-client URLs + (optional) hosted callback pages.
  // This prevents arbitrary redirect_uri injection.
  return (
    uri.startsWith('liveline://') ||
    uri.startsWith('exp://') ||
    uri.startsWith('https://auth.expo.io/') ||
    uri.startsWith('https://backend-production-d77b.up.railway.app/')
  );
}

router.get('/connect/spotify/auth-url', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const redirectUriRaw =
      (typeof req.query.redirectUri === 'string' ? req.query.redirectUri : null) ??
      process.env.SPOTIFY_REDIRECT_URI ??
      null;

    if (!clientId || !redirectUriRaw) {
      return res.status(501).json({
        error: 'Spotify OAuth is not configured on the backend (set SPOTIFY_CLIENT_ID + SPOTIFY_REDIRECT_URI).',
        data: null,
      });
    }

    if (!isAllowedSpotifyRedirectUri(redirectUriRaw)) {
      return res.status(400).json({ error: 'Invalid redirectUri.', data: null });
    }

    const state = issueSpotifyOAuthState(req.userId!);
    // user-read-currently-playing is required for GET /me/player/currently-playing (playback-state alone yields 403).
    const scope = [
      'user-read-email',
      'user-read-private',
      'user-read-playback-state',
      'user-read-currently-playing',
      'user-read-recently-played',
      'user-top-read',
    ].join(' ');

    const params = new URLSearchParams();
    params.set('response_type', 'code');
    params.set('client_id', clientId);
    params.set('redirect_uri', redirectUriRaw);
    params.set('scope', scope);
    params.set('state', state);
    // Request refresh token where supported.
    params.set('access_type', 'offline');

    const url = `https://accounts.spotify.com/authorize?${params.toString()}`;

    return res.json({ data: { url, state }, error: null });
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
    const { code, state, redirectUri } = req.body as { code?: string; state?: string; redirectUri?: string };
    console.log('[connect/spotify] redirectUri received:', redirectUri); // ADD THIS
    console.log('[connect/spotify] code:', code?.slice(0, 10));  
    if (!code || !state) {
      return res.status(400).json({ error: 'code and state are required', data: null });
    }
    if (redirectUri && !isAllowedSpotifyRedirectUri(redirectUri)) {
      return res.status(400).json({ error: 'Invalid redirectUri.', data: null });
    }
    await musicService.connectSpotify(req.userId!, code, state, redirectUri);
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
    .order('is_currently_playing', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
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

