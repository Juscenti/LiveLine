// ============================================================
// types/index.ts — Liveline shared type definitions
// ============================================================

export interface User {
  id: string;
  auth_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  profile_picture_url: string | null;
  banner_url: string | null;
  is_active: boolean;
  is_verified: boolean;
  default_location_visibility: VisibilityLevel;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
}

export interface Post {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  thumbnail_url: string | null;
  duration_sec: number | null;
  caption: string | null;
  music_id: string | null;
  visibility: VisibilityLevel;
  expires_at: string | null;
  is_deleted: boolean;
  like_count: number;
  view_count: number;
  created_at: string;
  // Joined fields
  author?: User;
  user_has_liked?: boolean;
  music?: MusicTrack;
}

export interface MusicTrack {
  id: string;
  user_id: string;
  song: string;
  artist: string;
  album: string | null;
  cover_url: string | null;
  source: MusicPlatform;
  platform_track_id: string | null;
  track_url: string | null;
  duration_ms: number | null;
  is_currently_playing: boolean;
  updated_at: string;
}

export interface Location {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  activity_status: string | null;
  visibility: VisibilityLevel;
  last_updated: string;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  ref_type: string | null;
  ref_id: string | null;
  content: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  actor?: User;
}

export interface Interest {
  id: number;
  name: string;
  slug: string;
  category: string | null;
}

export interface MediaUpload {
  id: string;
  user_id: string;
  original_key: string;
  processed_url: string | null;
  thumbnail_url: string | null;
  media_type: 'image' | 'video';
  duration_sec: number | null;
  status: MediaStatus;
}

// ── Enums / Unions ──────────────────────────────────────────

export type VisibilityLevel = 'public' | 'friends' | 'private';

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked' | 'declined';

export type MusicPlatform = 'spotify' | 'apple_music' | 'soundcloud';

export type MediaStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'post_like'
  | 'post_comment'
  | 'post_mention'
  | 'new_post_from_friend'
  | 'music_match'
  | 'system';

// ── API Shapes ──────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  has_more: boolean;
}

export interface FeedPost extends Post {
  author: User;
  user_has_liked: boolean;
}

export interface MapFriend {
  user_id: string;
  username: string;
  display_name: string | null;
  profile_picture_url: string | null;
  latitude: number;
  longitude: number;
  activity_status: string | null;
  music_song: string | null;
  music_artist: string | null;
  music_cover_url: string | null;
  distance_meters: number;
}
