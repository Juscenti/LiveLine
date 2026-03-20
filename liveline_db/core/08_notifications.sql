-- ============================================================
-- LIVELINE — 08_notifications.sql
-- In-app notification system
-- ============================================================

CREATE TABLE public.notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Recipient
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Actor (who triggered the notification) — nullable for system notifications
    actor_id        UUID REFERENCES public.users(id) ON DELETE SET NULL,

    type            TEXT NOT NULL CHECK (type IN (
                        'friend_request',       -- someone sent you a friend request
                        'friend_accepted',      -- your friend request was accepted
                        'post_like',            -- someone liked your post
                        'post_comment',         -- someone commented on your post
                        'post_mention',         -- someone mentioned you in a comment
                        'new_post_from_friend', -- a friend posted a new moment
                        'music_match',          -- you and a friend are listening to the same song
                        'system'                -- platform-wide system message
                    )),

    -- Reference to the triggering object (polymorphic)
    ref_type        TEXT CHECK (ref_type IN ('post', 'comment', 'friendship', 'music_activity', NULL)),
    ref_id          UUID,

    -- Display content
    content         TEXT NOT NULL CHECK (length(content) <= 200),

    -- Push notification payload (JSON for FCM / Expo)
    push_payload    JSONB,

    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id    ON public.notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_is_read    ON public.notifications (user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_actor_id   ON public.notifications (actor_id);
CREATE INDEX idx_notifications_ref        ON public.notifications (ref_type, ref_id);

-- Mark all as read helper
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = TRUE, read_at = NOW()
    WHERE user_id = p_user_id AND is_read = FALSE;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- Push Tokens (Expo / FCM)
-- ----------------------------------------------------------------
CREATE TABLE public.push_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL,
    platform    TEXT NOT NULL CHECK (platform IN ('expo', 'fcm', 'apns')),
    device_id   TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, token)
);

CREATE INDEX idx_push_tokens_user_id ON public.push_tokens (user_id) WHERE is_active = TRUE;

CREATE TRIGGER set_push_tokens_updated_at
    BEFORE UPDATE ON public.push_tokens
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
