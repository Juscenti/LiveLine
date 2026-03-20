-- ============================================================
-- LIVELINE — 09_media.sql
-- Media upload tracking + FFmpeg job queue
-- ============================================================

-- Master record of every uploaded file
CREATE TABLE public.media_uploads (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Original file details (before processing)
    original_key    TEXT NOT NULL,  -- Supabase Storage object key
    original_size   BIGINT,         -- bytes
    original_mime   TEXT,

    -- Processed output (after FFmpeg)
    processed_key   TEXT,
    processed_url   TEXT,
    thumbnail_key   TEXT,
    thumbnail_url   TEXT,

    media_type      TEXT NOT NULL CHECK (media_type IN ('image', 'video')),

    -- Video metadata
    duration_sec    NUMERIC(6,3),
    width           INT,
    height          INT,
    fps             REAL,

    -- Processing pipeline state
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    error_message   TEXT,

    -- Whether this upload is attached to a post
    post_id         UUID REFERENCES public.posts(id) ON DELETE SET NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_uploads_user_id  ON public.media_uploads (user_id);
CREATE INDEX idx_media_uploads_status   ON public.media_uploads (status) WHERE status <> 'ready';
CREATE INDEX idx_media_uploads_post_id  ON public.media_uploads (post_id);

CREATE TRIGGER set_media_uploads_updated_at
    BEFORE UPDATE ON public.media_uploads
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ----------------------------------------------------------------
-- FFmpeg Job Queue
-- ----------------------------------------------------------------
CREATE TABLE public.media_processing_jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id       UUID NOT NULL REFERENCES public.media_uploads(id) ON DELETE CASCADE,

    -- Job priority (lower = higher priority)
    priority        SMALLINT NOT NULL DEFAULT 5,

    -- Retry logic
    attempts        SMALLINT NOT NULL DEFAULT 0,
    max_attempts    SMALLINT NOT NULL DEFAULT 3,

    -- Operations to perform (ordered array)
    -- e.g. ["compress", "resize", "thumbnail", "convert_hls"]
    operations      JSONB NOT NULL DEFAULT '[]',

    -- FFmpeg-specific options
    ffmpeg_params   JSONB,

    status          TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'running', 'done', 'failed')),

    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    error_message   TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processing_jobs_status   ON public.media_processing_jobs (status, priority, created_at)
    WHERE status IN ('queued', 'failed');
CREATE INDEX idx_processing_jobs_upload   ON public.media_processing_jobs (upload_id);
