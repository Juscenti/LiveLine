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

type NormalizedSpotifyTrack = {
  song: string;
  artist: string;
  album: string | null;
  cover_url: string | null;
  platform_track_id: string | null;
  duration_ms: number | null;
};

function mapSpotifyTrackItem(item: any): NormalizedSpotifyTrack {
  const song = (typeof item?.name === 'string' ? item.name : '') || 'Unknown track';
  const artists = Array.isArray(item?.artists) ? item.artists : [];
  const artist = (artists[0]?.name as string) ?? 'Unknown';
  const album = (item?.album?.name as string) ?? null;
  const cover_url = (item?.album?.images?.[0]?.url as string) ?? null;
  const platform_track_id = (item?.id as string) ?? null;
  const duration_ms = (item?.duration_ms as number) ?? null;
  return { song, artist, album, cover_url, platform_track_id, duration_ms };
}

async function insertPlayingRow(userId: string, m: NormalizedSpotifyTrack) {
  const insert = await supabaseAdmin
    .from('music_activity')
    .insert({
      user_id: userId,
      song: m.song,
      artist: m.artist,
      album: m.album,
      cover_url: m.cover_url,
      platform_track_id: m.platform_track_id,
      track_url: null,
      duration_ms: m.duration_ms,
      source: 'spotify',
      is_currently_playing: true,
    })
    .select('*')
    .single();

  if (insert.error) throw insert.error;
  return insert.data;
}

/** Last-listen row: update timestamp if same track to avoid sync spam */
async function persistRecentTrack(userId: string, m: NormalizedSpotifyTrack) {
  if (m.platform_track_id) {
    const { data: latest } = await supabaseAdmin
      .from('music_activity')
      .select('id, platform_track_id')
      .eq('user_id', userId)
      .eq('is_currently_playing', false)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest?.platform_track_id === m.platform_track_id) {
      const u = await supabaseAdmin
        .from('music_activity')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', latest.id)
        .select('*')
        .single();
      if (!u.error && u.data) return u.data;
    }
  }

  const insert = await supabaseAdmin
    .from('music_activity')
    .insert({
      user_id: userId,
      song: m.song,
      artist: m.artist,
      album: m.album,
      cover_url: m.cover_url,
      platform_track_id: m.platform_track_id,
      track_url: null,
      duration_ms: m.duration_ms,
      source: 'spotify',
      is_currently_playing: false,
    })
    .select('*')
    .single();

  if (insert.error) throw insert.error;
  return insert.data;
}

async function fetchRecentFromSpotify(accessToken: string): Promise<NormalizedSpotifyTrack | null> {
  const rec = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
    params: { limit: 1 },
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (rec.status !== 200 || !rec.data?.items?.length) return null;
  const item = rec.data.items[0]?.track;
  if (!item) return null;
  return mapSpotifyTrackItem(item);
}

async function getCurrentPlayingFromSpotify(accessToken: string) {
  return axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 20000,
    validateStatus: () => true,
  });
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
  console.log('[connectSpotify] code:', code?.slice(0, 10));
  console.log('[connectSpotify] redirectUri used:', redirectUriOverride ?? process.env.SPOTIFY_REDIRECT_URI);
  console.log('[connectSpotify] state:', state?.slice(0, 10));

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

    // Validate and consume OAuth state only after all external API calls succeed
    if (!consumeSpotifyOAuthState(state, userId)) {
      throw new Error('Invalid or expired OAuth state. Open the music link again from the app.');
    }

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
    if ((!expiresAtMs || expiresAtMs - now < 60_000) && conn.refresh_token) {
      const refreshed = await refreshSpotifyAccessToken(conn);
      accessToken = refreshed.accessToken;
    }

    let cur = await getCurrentPlayingFromSpotify(accessToken);

    if ((cur.status === 401 || cur.status === 403) && conn.refresh_token) {
      try {
        const refreshed = await refreshSpotifyAccessToken(conn);
        accessToken = refreshed.accessToken;
        cur = await getCurrentPlayingFromSpotify(accessToken);
      } catch (refreshErr) {
        console.warn('Spotify access token refresh failed while syncing now playing', refreshErr);
      }
    }

    if (cur.status === 200 && cur.data?.item) {
      const isPlaying = cur.data?.is_playing === true;
      const m = mapSpotifyTrackItem(cur.data.item);
      if (isPlaying) {
        return await insertPlayingRow(userId, m);
      }
      await clearUserNowPlayingFlags(userId);
      return await persistRecentTrack(userId, m);
    }

    if (cur.status === 204 || (cur.status === 200 && !cur.data?.item)) {
      await clearUserNowPlayingFlags(userId);
      const m = await fetchRecentFromSpotify(accessToken);
      if (!m) return null;
      return await persistRecentTrack(userId, m);
    }

    if (cur.status === 401 || cur.status === 403 || cur.status === 404 || cur.status === 429) {
      const m = await fetchRecentFromSpotify(accessToken);
      if (m) {
        await clearUserNowPlayingFlags(userId);
        return await persistRecentTrack(userId, m);
      }
      return null;
    }

    if (cur.status >= 400) throw new Error(`Spotify currently-playing failed (${cur.status}).`);

    await clearUserNowPlayingFlags(userId);
    const fallback = await fetchRecentFromSpotify(accessToken);
    if (!fallback) return null;
    return await persistRecentTrack(userId, fallback);
  },
};

