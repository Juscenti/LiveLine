-- ============================================================
-- 16_messages.sql — Add direct messaging (1:1, text + images)
-- Run once on an existing Supabase DB that predates core/10_messages.sql.
-- Fresh installs: use liveline_db/00_run_all.sql instead.
-- ============================================================

-- Tables + triggers (same as core/10_messages.sql)
CREATE TABLE IF NOT EXISTS public.direct_conversations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lower_user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    higher_user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT dm_ordered_participants CHECK (lower_user_id < higher_user_id),
    CONSTRAINT dm_no_self CHECK (lower_user_id <> higher_user_id),
    UNIQUE (lower_user_id, higher_user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_lower  ON public.direct_conversations (lower_user_id);
CREATE INDEX IF NOT EXISTS idx_dm_higher ON public.direct_conversations (higher_user_id);
CREATE INDEX IF NOT EXISTS idx_dm_updated ON public.direct_conversations (updated_at DESC);

DROP TRIGGER IF EXISTS set_direct_conversations_updated_at ON public.direct_conversations;
CREATE TRIGGER set_direct_conversations_updated_at
    BEFORE UPDATE ON public.direct_conversations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS public.messages (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id     UUID NOT NULL REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
    sender_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    body                TEXT CHECK (body IS NULL OR length(trim(body)) <= 4000),
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

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages (sender_id);

DROP TRIGGER IF EXISTS set_messages_updated_at ON public.messages;
CREATE TRIGGER set_messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE OR REPLACE FUNCTION bump_direct_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.direct_conversations
    SET updated_at = NEW.created_at
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messages_bump_conversation ON public.messages;
CREATE TRIGGER trg_messages_bump_conversation
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION bump_direct_conversation_on_message();

-- RLS
ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "direct_conversations: participants read" ON public.direct_conversations;
CREATE POLICY "direct_conversations: participants read"
    ON public.direct_conversations FOR SELECT
    USING (
        lower_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        OR higher_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    );

DROP POLICY IF EXISTS "direct_conversations: friends can create" ON public.direct_conversations;
CREATE POLICY "direct_conversations: friends can create"
    ON public.direct_conversations FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.v_friends vf
            WHERE
                (vf.user_id = lower_user_id AND vf.friend_id = higher_user_id)
                OR (vf.user_id = higher_user_id AND vf.friend_id = lower_user_id)
        )
        AND (
            lower_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
            OR higher_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "direct_conversations: participants delete" ON public.direct_conversations;
CREATE POLICY "direct_conversations: participants delete"
    ON public.direct_conversations FOR DELETE
    USING (
        lower_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        OR higher_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    );

DROP POLICY IF EXISTS "messages: participants read" ON public.messages;
CREATE POLICY "messages: participants read"
    ON public.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.direct_conversations dc
            WHERE dc.id = messages.conversation_id
              AND (
                  dc.lower_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
                  OR dc.higher_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
              )
        )
    );

DROP POLICY IF EXISTS "messages: participant sender insert" ON public.messages;
CREATE POLICY "messages: participant sender insert"
    ON public.messages FOR INSERT
    WITH CHECK (
        sender_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.direct_conversations dc
            WHERE dc.id = messages.conversation_id
              AND (dc.lower_user_id = sender_id OR dc.higher_user_id = sender_id)
        )
    );

DROP POLICY IF EXISTS "messages: sender update" ON public.messages;
CREATE POLICY "messages: sender update"
    ON public.messages FOR UPDATE
    USING (sender_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "messages: sender delete" ON public.messages;
CREATE POLICY "messages: sender delete"
    ON public.messages FOR DELETE
    USING (sender_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Storage bucket + policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'message-images',
    'message-images',
    TRUE,
    15728640,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "message-images: participant read" ON storage.objects;
CREATE POLICY "message-images: participant read"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'message-images'
        AND EXISTS (
            SELECT 1
            FROM public.direct_conversations dc
            WHERE dc.id::text = (storage.foldername(name))[1]
              AND (
                  dc.lower_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
                  OR dc.higher_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
              )
        )
    );

DROP POLICY IF EXISTS "message-images: participant upload" ON storage.objects;
CREATE POLICY "message-images: participant upload"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'message-images'
        AND (storage.foldername(name))[2] = (SELECT id::text FROM public.users WHERE auth_id = auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.direct_conversations dc
            WHERE dc.id::text = (storage.foldername(name))[1]
              AND (
                  dc.lower_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
                  OR dc.higher_user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
              )
        )
    );

DROP POLICY IF EXISTS "message-images: owner delete" ON storage.objects;
CREATE POLICY "message-images: owner delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'message-images'
        AND (storage.foldername(name))[2] = (SELECT id::text FROM public.users WHERE auth_id = auth.uid())
    );

-- Realtime (ignore if already added)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already member of publication%' OR SQLERRM LIKE '%already exists%' THEN
      NULL;
    ELSE
      RAISE;
    END IF;
END $$;

-- RPC helpers (same as functions/13_functions.sql tail)
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
