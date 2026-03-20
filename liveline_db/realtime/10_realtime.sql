-- ============================================================
-- LIVELINE — 10_realtime.sql
-- Supabase Realtime channel configuration
-- All tables that need live updates are added to the
-- "supabase_realtime" publication.
-- ============================================================

-- Drop default if it exists, recreate with explicit tables
-- (Supabase creates this automatically, but we scope it precisely)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END;
$$;

-- Feed: new posts from friends
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;

-- Music: currently playing status
ALTER PUBLICATION supabase_realtime ADD TABLE public.music_activity;

-- Map: live location updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;

-- Notifications: incoming alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Friend requests: pending status changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;

-- Post engagement: likes + comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;

-- ----------------------------------------------------------------
-- Presence channels are managed by Supabase Realtime natively.
-- The following comment documents the intended channel layout
-- for the backend developers:
--
-- Channel: "map"
--   Track: { user_id, latitude, longitude, activity_status }
--
-- Channel: "feed"
--   Track: { user_id, last_post_at }
--
-- Channel: "music:{user_id}"
--   Track: { song, artist, cover_url, source, is_currently_playing }
-- ----------------------------------------------------------------
