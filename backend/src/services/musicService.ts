import { supabaseAdmin } from '../config/supabase';

/**
 * MVP placeholder implementation.
 * Keeps backend routes working and lets you wire Spotify/Apple/SoundCloud
 * incrementally without breaking app navigation.
 */
export const musicService = {
  async connectSpotify(userId: string, code: string) {
    await supabaseAdmin.from('music_connections').upsert(
      {
        user_id: userId,
        platform: 'spotify',
        is_active: true,
        platform_user_id: code,
      },
      { onConflict: 'user_id,platform' }
    );
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

  /**
   * MVP placeholder: returns the currently playing track if you already
   * inserted it elsewhere; otherwise returns null.
   */
  async syncNowPlaying(userId: string) {
    const { data } = await supabaseAdmin
      .from('music_activity')
      .select('*')
      .eq('user_id', userId)
      .eq('is_currently_playing', true)
      .maybeSingle();

    return data ?? null;
  },
};

