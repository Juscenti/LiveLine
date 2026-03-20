-- ============================================================
-- LIVELINE — 03_interests.sql
-- Tag-based interest system for user profiles
-- ============================================================

CREATE TABLE public.interests (
    id      SERIAL PRIMARY KEY,
    name    TEXT UNIQUE NOT NULL
                CHECK (length(name) >= 1 AND length(name) <= 50),
    slug    TEXT UNIQUE NOT NULL
                CHECK (slug ~ '^[a-z0-9_\-]+$'),

    -- Optional categorisation (e.g. "music", "sports", "tech")
    category    TEXT,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interests_slug     ON public.interests (slug);
CREATE INDEX idx_interests_category ON public.interests (category);

-- ----------------------------------------------------------------

CREATE TABLE public.user_interests (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    interest_id INT  NOT NULL REFERENCES public.interests(id) ON DELETE CASCADE,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, interest_id)
);

CREATE INDEX idx_user_interests_user_id     ON public.user_interests (user_id);
CREATE INDEX idx_user_interests_interest_id ON public.user_interests (interest_id);
