-- ============================================================
-- LIVELINE — 04_friendships.sql
-- Bidirectional friendship/follow system
-- ============================================================

CREATE TABLE public.friendships (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'blocked', 'declined')),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent self-friending
    CONSTRAINT no_self_friendship CHECK (requester_id <> addressee_id),

    -- One relationship record per pair
    UNIQUE (requester_id, addressee_id)
);

CREATE INDEX idx_friendships_requester  ON public.friendships (requester_id);
CREATE INDEX idx_friendships_addressee  ON public.friendships (addressee_id);
CREATE INDEX idx_friendships_status     ON public.friendships (status);

-- Composite index for fast "find all friends of user X" queries
CREATE INDEX idx_friendships_pair ON public.friendships (requester_id, addressee_id, status);

CREATE TRIGGER set_friendships_updated_at
    BEFORE UPDATE ON public.friendships
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ----------------------------------------------------------------
-- VIEW: Normalised mutual friends list
-- Returns all accepted friendships as a flat list for a given user
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_friends AS
SELECT
    f.id,
    f.requester_id AS user_id,
    f.addressee_id AS friend_id,
    f.created_at
FROM public.friendships f
WHERE f.status = 'accepted'

UNION ALL

SELECT
    f.id,
    f.addressee_id AS user_id,
    f.requester_id AS friend_id,
    f.created_at
FROM public.friendships f
WHERE f.status = 'accepted';
