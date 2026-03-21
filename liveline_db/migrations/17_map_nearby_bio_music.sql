-- Map: nearby friends include bio + latest music (now playing or most recently updated)
-- Return type (OUT columns) changed — must drop; CREATE OR REPLACE cannot alter row type (42P13).

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
