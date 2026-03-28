import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { supabaseAdmin } from '../config/supabase';
import { consumeSpotifyOAuthState } from './oauthStateStore';

/** Minimum scopes for player + recently-played sync (must match authorize URL in routes/music.ts). */
export const SPOTIFY_SYNC_REQUIRED_SCOPES = [
  'user-read-currently-playing',
  'user-read-recently-played',
] as const;

export type SpotifySyncMeta = {
  code?: 'SPOTIFY_RECONNECT_NEEDED';
};

export type SpotifySyncResult = {
  activity: Record<string, unknown> | null;
  meta: SpotifySyncMeta | null;
};

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

function logSpotify403Body(context: string, status: number, data: unknown) {
  if (status !== 403 && status !== 401) return;
  try {
    console.log(`[sync] Spotify ${context} ${status} body:`, JSON.stringify(data));
  } catch {
    console.log(`[sync] Spotify ${context} ${status} body: (unserializable)`);
  }
}

function spotifyErrorIndicatesInsufficientScope(data: unknown): boolean {
  const d = data as { error?: { message?: string; reason?: string } } | undefined;
  const msg = (d?.error?.message ?? d?.error?.reason ?? '').toLowerCase();
  return msg.includes('insufficient') && msg.includes('scope');
}

function storedScopesCoverSync(stored: string | null | undefined): boolean {
  if (stored == null || stored === '') return true;
  const have = new Set(stored.split(/\s+/).map((s) => s.trim()).filter(Boolean));
  return SPOTIFY_SYNC_REQUIRED_SCOPES.every((s) => have.has(s));
}

function spotifyWebApiErrorMessage(data: unknown): string {
  const d = data as { error?: { message?: string; reason?: string } } | undefined;
  return (d?.error?.message ?? d?.error?.reason ?? '').trim();
}

/** Operator / user hint when GET /v1/me fails (dev-mode allowlist, scopes, etc.). */
function spotifyMeFailureHint(status: number, data: unknown): string {
  const raw = spotifyWebApiErrorMessage(data);
  const lower = raw.toLowerCase();
  if (status === 403 || status === 401) {
    if (
      lower.includes('user not registered') ||
      lower.includes('not registered in the developer dashboard')
    ) {
      return `${raw || `HTTP ${status}`} Add this Spotify account under User management in the Spotify Developer Dashboard (Development mode), or move the app to Extended quota.`;
    }
    if (lower.includes('insufficient') && lower.includes('scope')) {
      return `${raw || `HTTP ${status}`} Disconnect and connect Spotify again in Liveline to grant all requested permissions.`;
    }
    if (
      lower.includes('development') ||
      lower.includes('not allowed') ||
      lower.includes('forbidden')
    ) {
      return raw
        ? `${raw} If the app is in Development mode, add your Spotify user to the app allowlist in the Developer Dashboard.`
        : `Spotify returned ${status}. If the app is in Development mode, add your Spotify user to the allowlist in the Developer Dashboard.`;
    }
  }
  return raw || `Spotify returned HTTP ${status}.`;
}

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
  return insert.data as Record<string, unknown>;
}

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
      if (!u.error && u.data) return u.data as Record<string, unknown>;
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
  return insert.data as Record<string, unknown>;
}

async function fetchRecentFromSpotify(
  accessToken: string,
): Promise<{ track: NormalizedSpotifyTrack | null; status: number; data: unknown }> {
  const rec = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
    params: { limit: 1 },
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 20000,
    validateStatus: () => true,
  });

  logSpotify403Body('recently-played', rec.status, rec.data);

  if (rec.status !== 200 || !rec.data?.items?.length) {
    return { track: null, status: rec.status, data: rec.data };
  }
  const item = rec.data.items[0]?.track;
  if (!item) return { track: null, status: rec.status, data: rec.data };
  return { track: mapSpotifyTrackItem(item), status: rec.status, data: rec.data };
}

async function getCurrentPlayingFromSpotify(accessToken: string): Promise<AxiosResponse> {
  return axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 20000,
    validateStatus: () => true,
  });
}

async function refreshSpotifyAccessToken(conn: Record<string, unknown>) {
  if (!conn?.refresh_token) throw new Error('Missing Spotify refresh token.');
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing Spotify client secrets (SPOTIFY_CLIENT_ID/SECRET).');

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: conn.refresh_token as string,
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

  const updatePayload: Record<string, unknown> = {
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? conn.refresh_token,
    token_expires_at: expiresAt,
  };
  if (typeof token.scope === 'string' && token.scope.trim()) {
    updatePayload.spotify_scope = token.scope;
  }

  const { error } = await supabaseAdmin
    .from('music_connections')
    .update(updatePayload)
    .eq('id', conn.id as string);

  if (error) throw error;
  return {
    accessToken: token.access_token,
    expiresAt,
  };
}

export const musicService = {
  async connectSpotify(userId: string, code: string, state: string, redirectUriOverride?: string) {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = redirectUriOverride ?? process.env.SPOTIFY_REDIRECT_URI;
    console.log('[connectSpotify] redirectUri:', redirectUri);
    console.log('[connectSpotify] code:', code?.slice(0, 15) + '...');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Spotify OAuth is not configured (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI).');
    }

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
    console.log('[connectSpotify] token exchange status:', tokenResp.status);
    if (tokenResp.status !== 200) {
      console.log('[connectSpotify] token error:', tokenResp.data?.error, tokenResp.data?.error_description);
    } else {
      console.log('[connectSpotify] token exchange success, has refresh_token:', !!tokenResp.data?.refresh_token);
      if (tokenResp.data?.scope) {
        console.log('[connectSpotify] granted scope:', tokenResp.data.scope);
      }
    }

    if (tokenResp.status >= 400) {
      const errBody = tokenResp.data as { error?: string; error_description?: string } | undefined;
      const detail =
        (typeof errBody?.error_description === 'string' && errBody.error_description) ||
        (typeof errBody?.error === 'string' && errBody.error) ||
        '';

      if (errBody?.error === 'invalid_grant') {
        throw new Error('Authorization code expired. Please try connecting to Spotify again.');
      }

      throw new Error(
        detail || `Spotify token exchange failed (${tokenResp.status}). Check redirect URI matches Spotify app settings.`,
      );
    }

    const token: SpotifyTokenResponse = tokenResp.data;
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    // GET /v1/me may return 403 while token exchange still succeeds — e.g. Spotify app in
    // Development mode with the Spotify user not on the dashboard User management allowlist.
    const meResp = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
      timeout: 20000,
      validateStatus: () => true,
    });
    console.log('[connectSpotify] /me status:', meResp.status);
    if (meResp.status !== 200) {
      console.log('[connectSpotify] /me error:', meResp.data);
    }

    let platformUserId: string;
    if (meResp.status === 200) {
      const id = meResp.data?.id as string | undefined;
      if (id) {
        platformUserId = id;
      } else {
        console.warn('[connectSpotify] /me returned 200 without id; using fallback platform_user_id');
        platformUserId = `fallback:${userId}`;
      }
    } else if (meResp.status === 401 || meResp.status === 403) {
      const hint = spotifyMeFailureHint(meResp.status, meResp.data);
      console.warn(
        '[connectSpotify] GET /v1/me failed; persisting tokens with fallback platform_user_id. Hint:',
        hint,
      );
      platformUserId = `fallback:${userId}`;
    } else {
      throw new Error(
        `Failed to get Spotify user info (${meResp.status}). ${spotifyMeFailureHint(meResp.status, meResp.data)}`,
      );
    }

    const { error } = await supabaseAdmin.from('music_connections').upsert(
      {
        user_id: userId,
        platform: 'spotify',
        platform_user_id: platformUserId,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        token_expires_at: expiresAt,
        spotify_scope: typeof token.scope === 'string' ? token.scope : null,
        is_active: true,
      },
      { onConflict: 'user_id,platform' },
    );

    if (error) throw error;

    if (!consumeSpotifyOAuthState(state, userId)) {
      throw new Error('Invalid or expired OAuth state. Open the music link again from the app.');
    }
  },

  async connectAppleMusic(userId: string, token: string) {
    await supabaseAdmin.from('music_connections').upsert(
      {
        user_id: userId,
        platform: 'apple_music',
        is_active: true,
        platform_user_id: token,
      },
      { onConflict: 'user_id,platform' },
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
      { onConflict: 'user_id,platform' },
    );
  },

  async userHasSpotifyLinked(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('music_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', 'spotify')
      .eq('is_active', true)
      .maybeSingle();
    if (error) return false;
    return !!data;
  },

  async syncNowPlaying(userId: string): Promise<SpotifySyncResult> {
    const reconnectMeta = (): SpotifySyncMeta => ({ code: 'SPOTIFY_RECONNECT_NEEDED' });

    console.log('[sync] userId:', userId);
    const conn = await getSpotifyConnection(userId);
    if (!conn) {
      console.log('[sync] no connection found');
      return { activity: null, meta: null };
    }
    console.log('[sync] connection found, access_token exists:', !!conn.access_token);

    const storedScope = (conn as { spotify_scope?: string | null }).spotify_scope;
    if (storedScope != null && storedScope !== '' && !storedScopesCoverSync(storedScope)) {
      console.log('[sync] stored spotify_scope missing required playback scopes');
      return { activity: null, meta: reconnectMeta() };
    }

    const now = Date.now();
    const expiresAtMs = conn.token_expires_at ? new Date(conn.token_expires_at as string).getTime() : 0;
    let accessToken = conn.access_token as string;

    if ((!expiresAtMs || expiresAtMs - now < 60_000) && conn.refresh_token) {
      const refreshed = await refreshSpotifyAccessToken(conn as Record<string, unknown>);
      accessToken = refreshed.accessToken;
    }

    let cur = await getCurrentPlayingFromSpotify(accessToken);
    logSpotify403Body('currently-playing', cur.status, cur.data);
    console.log('[sync] currently-playing status:', cur.status);

    if ((cur.status === 401 || cur.status === 403) && conn.refresh_token) {
      console.log('[sync] attempting token refresh');
      try {
        const refreshed = await refreshSpotifyAccessToken(conn as Record<string, unknown>);
        accessToken = refreshed.accessToken;
        cur = await getCurrentPlayingFromSpotify(accessToken);
        logSpotify403Body('currently-playing (after refresh)', cur.status, cur.data);
        console.log('[sync] after refresh, currently-playing status:', cur.status);
      } catch (refreshErr) {
        console.warn('Spotify access token refresh failed while syncing now playing', refreshErr);
      }
    }

    if (cur.status === 200 && cur.data?.item) {
      const isPlaying = cur.data?.is_playing === true;
      const m = mapSpotifyTrackItem(cur.data.item);
      if (isPlaying) {
        const result = await insertPlayingRow(userId, m);
        console.log('[sync] result: now playing track saved');
        return { activity: result, meta: null };
      }
      await clearUserNowPlayingFlags(userId);
      const result = await persistRecentTrack(userId, m);
      console.log('[sync] result: recent track saved');
      return { activity: result, meta: null };
    }

    if (cur.status === 204 || (cur.status === 200 && !cur.data?.item)) {
      await clearUserNowPlayingFlags(userId);
      const { track: m, status: recentSt, data: recentData } = await fetchRecentFromSpotify(accessToken);
      if (!m) {
        console.log('[sync] result: null (no recent tracks)');
        const needReconnect =
          recentSt === 403 &&
          (spotifyErrorIndicatesInsufficientScope(recentData) || !storedScopesCoverSync(storedScope));
        return {
          activity: null,
          meta: needReconnect ? reconnectMeta() : null,
        };
      }
      const result = await persistRecentTrack(userId, m);
      console.log('[sync] result: recent track saved');
      return { activity: result, meta: null };
    }

    if (cur.status === 401 || cur.status === 403 || cur.status === 404 || cur.status === 429) {
      const { track: m, status: recentSt, data: recentData } = await fetchRecentFromSpotify(accessToken);
      if (m) {
        await clearUserNowPlayingFlags(userId);
        const result = await persistRecentTrack(userId, m);
        console.log('[sync] result: fallback recent track saved');
        return { activity: result, meta: null };
      }
      console.log('[sync] result: null (fallback failed)');
      const insufficient =
        spotifyErrorIndicatesInsufficientScope(cur.data) ||
        (recentSt === 403 && spotifyErrorIndicatesInsufficientScope(recentData)) ||
        (cur.status === 403 && recentSt === 403) ||
        !storedScopesCoverSync(storedScope);
      return {
        activity: null,
        meta: insufficient ? reconnectMeta() : null,
      };
    }

    if (cur.status >= 400) throw new Error(`Spotify currently-playing failed (${cur.status}).`);

    await clearUserNowPlayingFlags(userId);
    const { track: fallback, status: recentSt, data: recentData } = await fetchRecentFromSpotify(accessToken);
    if (!fallback) {
      console.log('[sync] result: null');
      const needReconnect =
        recentSt === 403 &&
        (spotifyErrorIndicatesInsufficientScope(recentData) || !storedScopesCoverSync(storedScope));
      return { activity: null, meta: needReconnect ? reconnectMeta() : null };
    }
    const result = await persistRecentTrack(userId, fallback);
    console.log('[sync] result:', result ? 'track saved' : 'null');
    return { activity: result, meta: null };
  },
};
