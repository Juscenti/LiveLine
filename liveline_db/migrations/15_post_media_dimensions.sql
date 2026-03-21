-- ============================================================
-- 15_post_media_dimensions.sql — Add media dimensions for feed masonry
-- Run once on existing databases (fresh installs get this from core/05_posts.sql).
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_width  INT,
  ADD COLUMN IF NOT EXISTS media_height INT;

