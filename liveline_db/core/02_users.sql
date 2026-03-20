-- ============================================================
-- LIVELINE — 02_users.sql
-- Users table (mirrors Supabase auth.users via foreign key)
-- ============================================================

CREATE TABLE public.users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id         UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

    username        TEXT UNIQUE NOT NULL
                        CHECK (length(username) >= 3 AND length(username) <= 30)
                        CHECK (username ~ '^[a-zA-Z0-9_\.]+$'),

    email           TEXT UNIQUE NOT NULL,

    display_name    TEXT
                        CHECK (length(display_name) <= 50),

    bio             TEXT
                        CHECK (length(bio) <= 300),

    profile_picture_url TEXT,
    banner_url          TEXT,

    -- Account state
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,

    -- Privacy defaults
    default_location_visibility TEXT NOT NULL DEFAULT 'friends'
                        CHECK (default_location_visibility IN ('public', 'friends', 'private')),

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_users_username       ON public.users USING btree (lower(username));
CREATE INDEX idx_users_auth_id        ON public.users (auth_id);
CREATE INDEX idx_users_created_at     ON public.users (created_at DESC);

-- Trigram index for fuzzy search on username and display_name
CREATE INDEX idx_users_username_trgm      ON public.users USING gin (username gin_trgm_ops);
CREATE INDEX idx_users_display_name_trgm  ON public.users USING gin (display_name gin_trgm_ops);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
