-- Persist Spotify OAuth granted scope for sync diagnostics and reconnect UX.
ALTER TABLE public.music_connections
  ADD COLUMN IF NOT EXISTS spotify_scope TEXT;
