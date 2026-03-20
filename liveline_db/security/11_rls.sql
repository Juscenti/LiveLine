-- ============================================================
-- LIVELINE — 11_rls.sql
-- Row Level Security — every table locked down
-- ============================================================

-- ----------------------------------------------------------------
-- USERS
-- ----------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Anyone can view active profiles (for discovery/search)
CREATE POLICY "users: public read active"
    ON public.users FOR SELECT
    USING (is_active = TRUE);

-- Only the owner can update their own profile
CREATE POLICY "users: owner update"
    ON public.users FOR UPDATE
    USING (auth.uid() = auth_id);

-- Insert is handled by the new-user trigger, not direct client inserts
CREATE POLICY "users: no direct insert"
    ON public.users FOR INSERT
    WITH CHECK (FALSE);

-- ----------------------------------------------------------------
-- USER INTERESTS
-- ----------------------------------------------------------------
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_interests: read own or friend"
    ON public.user_interests FOR SELECT
    USING (
        user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.v_friends vf
            WHERE vf.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
              AND vf.friend_id = user_interests.user_id
        )
    );

CREATE POLICY "user_interests: manage own"
    ON public.user_interests FOR ALL
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ----------------------------------------------------------------
-- FRIENDSHIPS
-- ----------------------------------------------------------------
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships: parties can read"
    ON public.friendships FOR SELECT
    USING (
        requester_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        OR addressee_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    );

CREATE POLICY "friendships: requester can insert"
    ON public.friendships FOR INSERT
    WITH CHECK (requester_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "friendships: parties can update"
    ON public.friendships FOR UPDATE
    USING (
        requester_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        OR addressee_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    );

CREATE POLICY "friendships: parties can delete"
    ON public.friendships FOR DELETE
    USING (
        requester_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        OR addressee_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    );

-- ----------------------------------------------------------------
-- POSTS
-- ----------------------------------------------------------------
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts: public visibility"
    ON public.posts FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            visibility = 'public'
            OR user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
            OR (
                visibility = 'friends'
                AND EXISTS (
                    SELECT 1 FROM public.v_friends vf
                    WHERE vf.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
                      AND vf.friend_id = posts.user_id
                )
            )
        )
    );

CREATE POLICY "posts: owner insert"
    ON public.posts FOR INSERT
    WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "posts: owner update"
    ON public.posts FOR UPDATE
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ----------------------------------------------------------------
-- POST LIKES
-- ----------------------------------------------------------------
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_likes: readable if post is readable"
    ON public.post_likes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.posts p WHERE p.id = post_likes.post_id
        )
    );

CREATE POLICY "post_likes: owner insert/delete"
    ON public.post_likes FOR ALL
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ----------------------------------------------------------------
-- POST COMMENTS
-- ----------------------------------------------------------------
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_comments: readable if post is readable"
    ON public.post_comments FOR SELECT
    USING (
        is_deleted = FALSE
        AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_comments.post_id)
    );

CREATE POLICY "post_comments: owner insert"
    ON public.post_comments FOR INSERT
    WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "post_comments: owner update/delete"
    ON public.post_comments FOR UPDATE
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ----------------------------------------------------------------
-- MUSIC ACTIVITY
-- ----------------------------------------------------------------
ALTER TABLE public.music_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "music_activity: friends or self can read"
    ON public.music_activity FOR SELECT
    USING (
        user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.v_friends vf
            WHERE vf.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
              AND vf.friend_id = music_activity.user_id
        )
    );

CREATE POLICY "music_activity: owner manages"
    ON public.music_activity FOR ALL
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ----------------------------------------------------------------
-- MUSIC CONNECTIONS (tokens — very sensitive)
-- ----------------------------------------------------------------
ALTER TABLE public.music_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "music_connections: owner only"
    ON public.music_connections FOR ALL
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ----------------------------------------------------------------
-- LOCATIONS
-- ----------------------------------------------------------------
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "locations: respect visibility setting"
    ON public.locations FOR SELECT
    USING (
        user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        OR visibility = 'public'
        OR (
            visibility = 'friends'
            AND EXISTS (
                SELECT 1 FROM public.v_friends vf
                WHERE vf.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
                  AND vf.friend_id = locations.user_id
            )
        )
    );

CREATE POLICY "locations: owner manages"
    ON public.locations FOR ALL
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ----------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: owner only"
    ON public.notifications FOR ALL
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ----------------------------------------------------------------
-- PUSH TOKENS
-- ----------------------------------------------------------------
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_tokens: owner only"
    ON public.push_tokens FOR ALL
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ----------------------------------------------------------------
-- MEDIA UPLOADS
-- ----------------------------------------------------------------
ALTER TABLE public.media_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_uploads: owner only"
    ON public.media_uploads FOR ALL
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ----------------------------------------------------------------
-- INTERESTS (read-only for everyone — admin managed)
-- ----------------------------------------------------------------
ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interests: public read"
    ON public.interests FOR SELECT
    USING (TRUE);
