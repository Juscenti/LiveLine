-- ============================================================
-- LIVELINE — 00_run_all.sql
-- Master migration script — run this in order in your
-- Supabase SQL editor or via psql.
--
-- EXECUTION ORDER (dependencies respected):
--
--   01  Extensions        — uuid-ossp, pgcrypto, postgis, pg_trgm
--   02  Users             — core identity table
--   03  Interests         — tag catalogue + user_interests join
--   04  Friendships       — relationship graph + v_friends view
--   05  Posts             — moments, likes, views, comments
--   06  Music             — connections, activity, top tracks
--   07  Locations         — live map with PostGIS
--   08  Notifications     — in-app alerts + push tokens
--   09  Media             — upload tracking + FFmpeg job queue
--   10  Realtime          — Supabase publication config
--   11  RLS               — row-level security for every table
--   12  Storage           — bucket definitions + policies
--   13  Functions         — business logic, triggers, RPC helpers
--   14  Seed              — interests data + optional dev fixtures
--
-- Run via psql:
--   psql "$DATABASE_URL" -f 00_run_all.sql
--
-- Or copy-paste each file into the Supabase SQL editor
-- in numeric order.
-- ============================================================

\ir core/01_extensions.sql
\ir core/02_users.sql
\ir core/03_interests.sql
\ir core/04_friendships.sql
\ir core/05_posts.sql
\ir core/06_music.sql
\ir core/07_locations.sql
\ir core/08_notifications.sql
\ir core/09_media.sql
\ir realtime/10_realtime.sql
\ir security/11_rls.sql
\ir storage/12_storage.sql
\ir functions/13_functions.sql
\ir seed/14_seed.sql
