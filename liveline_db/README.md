# Liveline — Database SQL Package

Full PostgreSQL / Supabase schema for the Liveline real-time social app.

## Folder Structure

```
liveline_db/
├── 00_run_all.sql          ← Master migration (run this)
│
├── core/
│   ├── 01_extensions.sql   ← uuid-ossp, pgcrypto, postgis, pg_trgm
│   ├── 02_users.sql        ← Users table, indexes, updated_at trigger
│   ├── 03_interests.sql    ← Interest tags + user_interests join table
│   ├── 04_friendships.sql  ← Friend graph + v_friends view
│   ├── 05_posts.sql        ← Posts, likes, views, comments + sync triggers
│   ├── 06_music.sql        ← Music connections, activity, top tracks
│   ├── 07_locations.sql    ← Live map (PostGIS), location history, upsert fn
│   ├── 08_notifications.sql← In-app notifications + push tokens
│   └── 09_media.sql        ← Upload tracking + FFmpeg job queue
│
├── realtime/
│   └── 10_realtime.sql     ← Supabase publication configuration
│
├── security/
│   └── 11_rls.sql          ← Row Level Security for every table
│
├── storage/
│   └── 12_storage.sql      ← Storage buckets + access policies
│
├── functions/
│   └── 13_functions.sql    ← Business logic, triggers, RPC helpers
│
└── seed/
    └── 14_seed.sql         ← Interests catalogue + dev fixtures
```

## What's Covered

| Area | Tables / Objects |
|---|---|
| Auth | `users`, `auth.users` trigger (auto-creates profile) |
| Profiles | `users`, `interests`, `user_interests` |
| Social graph | `friendships`, `v_friends` view |
| Moments | `posts`, `post_likes`, `post_views`, `post_comments` |
| Music | `music_connections`, `music_activity`, `user_top_tracks` |
| Live map | `locations`, `location_history` (PostGIS) |
| Notifications | `notifications`, `push_tokens` |
| Media pipeline | `media_uploads`, `media_processing_jobs` |
| Realtime | Supabase publication for feed, map, music, notifications |
| Security | RLS on every table — owner, friends, public tiers |
| Storage | 5 buckets: avatars, banners, posts, posts-processed, thumbnails |
| Functions | Feed pagination, user search, nearby friends, music match detection |
| Seed | 48 interest tags across music, sports, tech, art, lifestyle |

## How to Run

### Option A — Supabase SQL Editor
Paste each `.sql` file into the editor in numbered order (01 → 14).

### Option B — psql
```bash
psql "$DATABASE_URL" -f 00_run_all.sql
```

### Option C — Supabase CLI
```bash
supabase db push
# Or place files in supabase/migrations/ with timestamps
```

## Notes

- **PostGIS** must be enabled in your Supabase project (Database → Extensions).
- **pg_trgm** is needed for fuzzy username search.
- The `music_connections` table stores OAuth tokens — use Supabase Vault in production to encrypt them.
- The seed dev fixtures in `14_seed.sql` are commented out — uncomment for local development only.
- The `purge_expired_posts()` function should be scheduled via `pg_cron` or a cron job on your backend.
