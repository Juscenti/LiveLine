-- ============================================================
-- LIVELINE — 10_messages.sql
-- Direct messages (1:1) between users; text and/or image per message
-- Depends on: users, friendships (v_friends)
-- ============================================================

-- ----------------------------------------------------------------
-- Direct conversations (canonical pair: lower_user_id < higher_user_id)
-- ----------------------------------------------------------------
CREATE TABLE public.direct_conversations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    lower_user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    higher_user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT dm_ordered_participants CHECK (lower_user_id < higher_user_id),
    CONSTRAINT dm_no_self CHECK (lower_user_id <> higher_user_id),
    UNIQUE (lower_user_id, higher_user_id)
);

CREATE INDEX idx_dm_lower  ON public.direct_conversations (lower_user_id);
CREATE INDEX idx_dm_higher ON public.direct_conversations (higher_user_id);
CREATE INDEX idx_dm_updated ON public.direct_conversations (updated_at DESC);

CREATE TRIGGER set_direct_conversations_updated_at
    BEFORE UPDATE ON public.direct_conversations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ----------------------------------------------------------------
-- Messages
-- ----------------------------------------------------------------
CREATE TABLE public.messages (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    conversation_id     UUID NOT NULL REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
    sender_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Text body (optional if sending image-only)
    body                TEXT CHECK (body IS NULL OR length(trim(body)) <= 4000),

    -- Image attachment (public URL in `message-images` bucket after upload)
    image_url           TEXT,
    image_width         INT,
    image_height        INT,

    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT messages_has_content CHECK (
        (body IS NOT NULL AND length(trim(body)) > 0)
        OR (image_url IS NOT NULL AND length(trim(image_url)) > 0)
    )
);

CREATE INDEX idx_messages_conversation_created
    ON public.messages (conversation_id, created_at DESC);

CREATE INDEX idx_messages_sender
    ON public.messages (sender_id);

CREATE TRIGGER set_messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Bump parent conversation when a new message is inserted
CREATE OR REPLACE FUNCTION bump_direct_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.direct_conversations
    SET updated_at = NEW.created_at
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_bump_conversation
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION bump_direct_conversation_on_message();
