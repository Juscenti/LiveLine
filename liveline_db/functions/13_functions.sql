-- ============================================================
-- LIVELINE — 13_functions.sql
-- Core business logic functions and automation triggers
-- ============================================================

-- ----------------------------------------------------------------
-- Auto-create public.users record on Supabase auth signup
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (auth_id, email, username, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        -- Default username from email prefix; must be unique, so append random suffix
        LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'))
            || '_' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4),
        SPLIT_PART(NEW.email, '@', 1)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ----------------------------------------------------------------
-- Update last_seen_at when user calls any API
-- (called explicitly from backend middleware, or via RPC)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_user_last_seen(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.users SET last_seen_at = NOW() WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------
-- Create a friend request notification
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_friend_request()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'pending' THEN
        INSERT INTO public.notifications (user_id, actor_id, type, ref_type, ref_id, content)
        VALUES (
            NEW.addressee_id,
            NEW.requester_id,
            'friend_request',
            'friendship',
            NEW.id,
            (SELECT display_name || ' sent you a friend request' FROM public.users WHERE id = NEW.requester_id)
        );
    ELSIF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
        INSERT INTO public.notifications (user_id, actor_id, type, ref_type, ref_id, content)
        VALUES (
            NEW.requester_id,
            NEW.addressee_id,
            'friend_accepted',
            'friendship',
            NEW.id,
            (SELECT display_name || ' accepted your friend request' FROM public.users WHERE id = NEW.addressee_id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_friend_request
    AFTER INSERT OR UPDATE ON public.friendships
    FOR EACH ROW EXECUTE FUNCTION notify_friend_request();

-- ----------------------------------------------------------------
-- Create a like notification
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_post_like()
RETURNS TRIGGER AS $$
DECLARE
    v_post_owner UUID;
BEGIN
    SELECT user_id INTO v_post_owner FROM public.posts WHERE id = NEW.post_id;

    -- Don't notify yourself
    IF v_post_owner IS NOT NULL AND v_post_owner <> NEW.user_id THEN
        INSERT INTO public.notifications (user_id, actor_id, type, ref_type, ref_id, content)
        VALUES (
            v_post_owner,
            NEW.user_id,
            'post_like',
            'post',
            NEW.post_id,
            (SELECT display_name || ' liked your moment' FROM public.users WHERE id = NEW.user_id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_post_like
    AFTER INSERT ON public.post_likes
    FOR EACH ROW EXECUTE FUNCTION notify_post_like();

-- ----------------------------------------------------------------
-- Create a comment notification
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_post_comment()
RETURNS TRIGGER AS $$
DECLARE
    v_post_owner UUID;
BEGIN
    SELECT user_id INTO v_post_owner FROM public.posts WHERE id = NEW.post_id;

    IF v_post_owner IS NOT NULL AND v_post_owner <> NEW.user_id THEN
        INSERT INTO public.notifications (user_id, actor_id, type, ref_type, ref_id, content)
        VALUES (
            v_post_owner,
            NEW.user_id,
            'post_comment',
            'comment',
            NEW.id,
            (SELECT display_name || ' commented on your moment' FROM public.users WHERE id = NEW.user_id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_post_comment
    AFTER INSERT ON public.post_comments
    FOR EACH ROW EXECUTE FUNCTION notify_post_comment();

-- ----------------------------------------------------------------
-- Music match detection
-- Fires when a user starts playing a track — checks if any friend
-- is playing the same song right now and sends a mutual notification.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_music_match()
RETURNS TRIGGER AS $$
DECLARE
    v_friend RECORD;
BEGIN
    IF NEW.is_currently_playing = TRUE THEN
        -- Find friends currently playing the same song
        FOR v_friend IN
            SELECT vf.friend_id
            FROM public.v_friends vf
            JOIN public.music_activity ma ON ma.user_id = vf.friend_id
            WHERE vf.user_id = NEW.user_id
              AND ma.is_currently_playing = TRUE
              AND LOWER(ma.song)   = LOWER(NEW.song)
              AND LOWER(ma.artist) = LOWER(NEW.artist)
        LOOP
            -- Notify the current user
            INSERT INTO public.notifications (user_id, actor_id, type, ref_type, ref_id, content)
            VALUES (
                NEW.user_id,
                v_friend.friend_id,
                'music_match',
                'music_activity',
                NEW.id,
                (SELECT display_name || ' is listening to ' || NEW.song || ' too!'
                 FROM public.users WHERE id = v_friend.friend_id)
            )
            ON CONFLICT DO NOTHING;

            -- Notify the friend
            INSERT INTO public.notifications (user_id, actor_id, type, ref_type, ref_id, content)
            VALUES (
                v_friend.friend_id,
                NEW.user_id,
                'music_match',
                'music_activity',
                NEW.id,
                (SELECT display_name || ' is also listening to ' || NEW.song || '!'
                 FROM public.users WHERE id = NEW.user_id)
            )
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_detect_music_match
    AFTER INSERT OR UPDATE ON public.music_activity
    FOR EACH ROW EXECUTE FUNCTION detect_music_match();

-- ----------------------------------------------------------------
-- Expired post cleanup (run via pg_cron or scheduled job)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_expired_posts()
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE public.posts
    SET is_deleted = TRUE
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
      AND is_deleted = FALSE;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------
-- Feed query: get friend posts for the authenticated user
-- (paginated, excludes expired and deleted)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_friend_feed(
    p_user_id   UUID,
    p_limit     INT  DEFAULT 20,
    p_cursor    TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    post_id         UUID,
    author_id       UUID,
    username        TEXT,
    display_name    TEXT,
    profile_picture_url TEXT,
    media_url       TEXT,
    media_type      TEXT,
    thumbnail_url   TEXT,
    media_width     INT,
    media_height    INT,
    caption         TEXT,
    like_count      INT,
    view_count      INT,
    created_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    user_has_liked  BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.user_id,
        u.username,
        u.display_name,
        u.profile_picture_url,
        p.media_url,
        p.media_type,
        p.thumbnail_url,
        p.media_width,
        p.media_height,
        p.caption,
        p.like_count,
        p.view_count,
        p.created_at,
        p.expires_at,
        EXISTS (
            SELECT 1 FROM public.post_likes pl
            WHERE pl.post_id = p.id AND pl.user_id = p_user_id
        )
    FROM public.posts p
    JOIN public.users u ON u.id = p.user_id
    WHERE p.is_deleted = FALSE
      AND (p.expires_at IS NULL OR p.expires_at > NOW())
      AND p.created_at < p_cursor
      AND (
          p.user_id = p_user_id
          OR EXISTS (
              SELECT 1 FROM public.v_friends vf
              WHERE vf.user_id = p_user_id AND vf.friend_id = p.user_id
          )
      )
      AND p.visibility IN ('public', 'friends')
    ORDER BY p.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------
-- Search users by username or display name (trigram fuzzy)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_users(
    p_query     TEXT,
    p_limit     INT DEFAULT 20,
    p_offset    INT DEFAULT 0
)
RETURNS TABLE (
    id                  UUID,
    username            TEXT,
    display_name        TEXT,
    profile_picture_url TEXT,
    bio                 TEXT,
    similarity          REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.username,
        u.display_name,
        u.profile_picture_url,
        u.bio,
        GREATEST(
            similarity(u.username, p_query),
            similarity(COALESCE(u.display_name, ''), p_query)
        ) AS sim
    FROM public.users u
    WHERE
        u.is_active = TRUE
        AND (
            u.username      % p_query
            OR u.display_name % p_query
        )
    ORDER BY sim DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------
-- Nearby users on the live map (PostGIS radius query)
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_nearby_friends(
  uuid,
  double precision,
  double precision,
  double precision
);

CREATE OR REPLACE FUNCTION public.get_nearby_friends(
    p_user_id       UUID,
    p_latitude      DOUBLE PRECISION,
    p_longitude     DOUBLE PRECISION,
    p_radius_meters FLOAT DEFAULT 5000
)
RETURNS TABLE (
    user_id             UUID,
    username            TEXT,
    display_name        TEXT,
    profile_picture_url TEXT,
    bio                 TEXT,
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    activity_status     TEXT,
    music_song          TEXT,
    music_artist        TEXT,
    music_cover_url     TEXT,
    music_is_currently_playing BOOLEAN,
    music_source        TEXT,
    distance_meters     FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.username,
        u.display_name,
        u.profile_picture_url,
        u.bio,
        l.latitude,
        l.longitude,
        l.activity_status,
        ma.song,
        ma.artist,
        ma.cover_url,
        COALESCE(ma.is_currently_playing, FALSE),
        ma.source::TEXT,
        ST_Distance(
            l.geom,
            ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
        )::FLOAT
    FROM public.locations l
    JOIN public.users u ON u.id = l.user_id
    LEFT JOIN LATERAL (
        SELECT
            ma2.song,
            ma2.artist,
            ma2.cover_url,
            ma2.is_currently_playing,
            ma2.source
        FROM public.music_activity ma2
        WHERE ma2.user_id = l.user_id
        ORDER BY ma2.is_currently_playing DESC, ma2.updated_at DESC
        LIMIT 1
    ) ma ON TRUE
    WHERE
        l.visibility IN ('public', 'friends')
        AND l.user_id <> p_user_id
        AND (
            l.visibility = 'public'
            OR EXISTS (
                SELECT 1 FROM public.v_friends vf
                WHERE vf.user_id = p_user_id AND vf.friend_id = l.user_id
            )
        )
        AND ST_DWithin(
            l.geom,
            ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
            p_radius_meters
        )
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------
-- Direct messages: lookup or create 1:1 conversation (friends only)
-- Call from app via supabase.rpc('get_or_create_direct_conversation', { p_other_user_id })
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION direct_conversation_id(p_user_a UUID, p_user_b UUID)
RETURNS UUID AS $$
DECLARE
    v_lower UUID;
    v_higher UUID;
    v_id UUID;
BEGIN
    IF p_user_a = p_user_b THEN
        RAISE EXCEPTION 'invalid pair';
    END IF;
    IF p_user_a < p_user_b THEN
        v_lower := p_user_a;
        v_higher := p_user_b;
    ELSE
        v_lower := p_user_b;
        v_higher := p_user_a;
    END IF;

    SELECT id INTO v_id
    FROM public.direct_conversations
    WHERE lower_user_id = v_lower AND higher_user_id = v_higher;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_or_create_direct_conversation(p_other_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_me UUID;
    v_lower UUID;
    v_higher UUID;
    v_id UUID;
BEGIN
    IF p_other_user_id IS NULL THEN
        RAISE EXCEPTION 'other user required';
    END IF;

    SELECT id INTO v_me FROM public.users WHERE auth_id = auth.uid();
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;
    IF p_other_user_id = v_me THEN
        RAISE EXCEPTION 'invalid pair';
    END IF;

    IF v_me < p_other_user_id THEN
        v_lower := v_me;
        v_higher := p_other_user_id;
    ELSE
        v_lower := p_other_user_id;
        v_higher := v_me;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.v_friends vf
        WHERE (vf.user_id = v_lower AND vf.friend_id = v_higher)
           OR (vf.user_id = v_higher AND vf.friend_id = v_lower)
    ) THEN
        RAISE EXCEPTION 'not friends';
    END IF;

    SELECT id INTO v_id
    FROM public.direct_conversations
    WHERE lower_user_id = v_lower AND higher_user_id = v_higher;

    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    INSERT INTO public.direct_conversations (lower_user_id, higher_user_id)
    VALUES (v_lower, v_higher)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.direct_conversation_id(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(UUID) TO authenticated, service_role;
