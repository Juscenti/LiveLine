import axios from 'axios';
import { supabaseAdmin } from '../config/supabase';
import { consumeSpotifyOAuthState } from './oauthStateStore';

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

async function getSpotifyConnection(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('music_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'spotify')
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function clearUserNowPlayingFlags(userId: string) {
  await supabaseAdmin
    .from('music_activity')
    .update({ is_currently_playing: false })
    .eq('user_id', userId)
    .eq('is_currently_playing', true);
}

async function refreshSpotifyAccessToken(conn: any) {
  if (!conn?.refresh_token) throw new Error('Missing Spotify refresh token.');
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing Spotify client secrets (SPOTIFY_CLIENT_ID/SECRET).');

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: conn.refresh_token,
  }).toString();

  const resp = await axios.post('https://accounts.spotify.com/api/token', body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    timeout: 20000,
  });

  const token: SpotifyTokenResponse = resp.data;
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from('music_connections')
    .update({
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? conn.refresh_token,
      token_expires_at: expiresAt,
    })
    .eq('id', conn.id);

  if (error) throw error;
  return {
    accessToken: token.access_token,
    expiresAt,
  };
}

export const musicService = {
  async connectSpotify(userId: string, code: string, state: string, redirectUriOverride?: string) {
    if (!consumeSpotifyOAuthState(state, userId)) {
      throw new Error('Invalid or expired OAuth state. Open the music link again from the app.');
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = redirectUriOverride ?? process.env.SPOTIFY_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Spotify OAuth is not configured (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI).');
    }

    // Exchange authorization code for tokens.
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString();

    const tokenResp = await axios.post('https://accounts.spotify.com/api/token', body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      timeout: 20000,
      validateStatus: () => true,
    });

    if (tokenResp.status >= 400) {
      const errBody = tokenResp.data as { error?: string; error_description?: string } | undefined;
      const detail =
        (typeof errBody?.error_description === 'string' && errBody.error_description) ||
        (typeof errBody?.error === 'string' && errBody.error) ||
        '';
      throw new Error(
        detail || `Spotify token exchange failed (${tokenResp.status}). Check redirect URI matches Spotify app settings.`,
      );
    }

    const token: SpotifyTokenResponse = tokenResp.data;
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    // Fetch Spotify user id.
    const meResp = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
      timeout: 20000,
    });

    const platformUserId = meResp.data?.id as string | undefined;
    if (!platformUserId) throw new Error('Spotify /me did not return an id.');

    // Store connection + refresh token for future sync.
    const { error } = await supabaseAdmin.from('music_connections').upsert(
      {
        user_id: userId,
        platform: 'spotify',
        platform_user_id: platformUserId,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        token_expires_at: expiresAt,
        is_active: true,
      },
      { onConflict: 'user_id,platform' }
    );

    if (error) throw error;
  },

  async connectAppleMusic(userId: string, token: string) {
    await supabaseAdmin.from('music_connections').upsert(
      {
        user_id: userId,
        platform: 'apple_music',
        is_active: true,
        platform_user_id: token,
      },
      { onConflict: 'user_id,platform' }
    );
  },

  async connectSoundCloud(userId: string, code: string) {
    await supabaseAdmin.from('music_connections').upsert(
      {
        user_id: userId,
        platform: 'soundcloud',
        is_active: true,
        platform_user_id: code,
      },
      { onConflict: 'user_id,platform' }
    );
  },

  async syncNowPlaying(userId: string) {
    const conn = await getSpotifyConnection(userId);
    if (!conn) return null;

    const now = Date.now();
    const expiresAtMs = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
    let accessToken = conn.access_token as string;

    // Refresh if needed.
    if (expiresAtMs && expiresAtMs - now < 60_000) {
      const refreshed = await refreshSpotifyAccessToken(conn);
      accessToken = refreshed.accessToken;
    }

    const resp = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 20000,
      validateStatus: () => true,
    });

    // 204 = nothing playing. 401/403/404 often = free-tier / no playback scope / no active device — don't 500 the app.
    if (resp.status === 204) {
      await clearUserNowPlayingFlags(userId);
      return null;
    }
    if (resp.status === 401 || resp.status === 403 || resp.status === 404 || resp.status === 429) {
      await clearUserNowPlayingFlags(userId);
      return null;
    }
    if (resp.status >= 400) throw new Error(`Spotify currently-playing failed (${resp.status}).`);

    const item = resp.data?.item;
    if (!item) {
      await clearUserNowPlayingFlags(userId);
      return null;
    }

    const song = item?.name;
    const artists = Array.isArray(item?.artists) ? item.artists : [];
    const artist = artists[0]?.name ?? 'Unknown';
    const album = item?.album?.name ?? null;
    const cover_url = item?.album?.images?.[0]?.url ?? null;
    const platform_track_id = item?.id ?? null;
    const duration_ms = item?.duration_ms ?? null;

    const insert = await supabaseAdmin
      .from('music_activity')
      .insert({
        user_id: userId,
        song,
        artist,
        album,
        cover_url,
        source: 'spotify',
        platform_track_id,
        track_url: null,
        duration_ms,
        is_currently_playing: true,
      })
      .select('*')
      .single();

    if (insert.error) throw insert.error;
    return insert.data;
  },
};

