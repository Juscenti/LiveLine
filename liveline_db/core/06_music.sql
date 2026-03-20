-- ============================================================
-- LIVELINE — 06_music.sql
-- Music activity: currently playing + recently played
-- ============================================================

-- Connected music platform tokens per user
CREATE TABLE public.music_connections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    platform        TEXT NOT NULL CHECK (platform IN ('spotify', 'apple_music', 'soundcloud')),

    -- OAuth tokens (store encrypted in production via Vault)
    access_token    TEXT,
    refresh_token   TEXT,
    token_expires_at TIMESTAMPTZ,

    -- Platform-specific user identifier
    platform_user_id TEXT,

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, platform)
);

CREATE INDEX idx_music_connections_user_id  ON public.music_connections (user_id);
CREATE INDEX idx_music_connections_platform ON public.music_connections (platform);

CREATE TRIGGER set_music_connections_updated_at
    BEFORE UPDATE ON public.music_connections
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ----------------------------------------------------------------
-- Music Activity
-- Normalised across all three platforms
-- ----------------------------------------------------------------
CREATE TABLE public.music_activity (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Normalised track data
    song                TEXT NOT NULL,
    artist              TEXT NOT NULL,
    album               TEXT,
    cover_url           TEXT,

    -- Source platform
    source              TEXT NOT NULL CHECK (source IN ('spotify', 'apple_music', 'soundcloud')),

    -- Platform-specific track ID for deep linking / sync
    platform_track_id   TEXT,
    track_url           TEXT,

    -- Duration in milliseconds
    duration_ms         INT,

    -- Playback state
    is_currently_playing BOOLEAN NOT NULL DEFAULT FALSE,

    -- When this track was last detected as active
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one track can be "currently playing" per user at a time
CREATE UNIQUE INDEX idx_music_activity_one_active
    ON public.music_activity (user_id)
    WHERE is_currently_playing = TRUE;

CREATE INDEX idx_music_activity_user_id    ON public.music_activity (user_id);
CREATE INDEX idx_music_activity_updated_at ON public.music_activity (updated_at DESC);

-- When a new currently-playing record is inserted, clear old ones
CREATE OR REPLACE FUNCTION enforce_single_now_playing()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_currently_playing = TRUE THEN
        UPDATE public.music_activity
        SET is_currently_playing = FALSE
        WHERE user_id = NEW.user_id
          AND id <> NEW.id
          AND is_currently_playing = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_single_now_playing
    AFTER INSERT OR UPDATE ON public.music_activity
    FOR EACH ROW EXECUTE FUNCTION enforce_single_now_playing();

-- ----------------------------------------------------------------
-- Top Tracks (for profile display — periodically synced)
-- ----------------------------------------------------------------
CREATE TABLE public.user_top_tracks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    song            TEXT NOT NULL,
    artist          TEXT NOT NULL,
    cover_url       TEXT,
    platform        TEXT NOT NULL CHECK (platform IN ('spotify', 'apple_music', 'soundcloud')),
    platform_track_id TEXT,

    rank            SMALLINT NOT NULL,  -- 1-based rank on profile
    time_range      TEXT DEFAULT 'medium_term'
                        CHECK (time_range IN ('short_term', 'medium_term', 'long_term')),

    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, rank, time_range)
);

CREATE INDEX idx_user_top_tracks_user_id ON public.user_top_tracks (user_id);
