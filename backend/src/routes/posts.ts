import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin, createSupabaseUserClient } from '../config/supabase';
import { requireAuth, upload } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { mediaService } from '../services/mediaService';

const router = Router();

router.get('/feed', requireAuth, getFeed);
router.get('/:postId', requireAuth, getPost);
router.post('/', requireAuth, upload.single('media'), createPost);
router.delete('/:postId', requireAuth, deletePost);
router.post('/:postId/like', requireAuth, likePost);
router.delete('/:postId/like', requireAuth, unlikePost);
router.post('/:postId/view', requireAuth, recordView);
router.get('/:postId/comments', requireAuth, getComments);
router.post('/:postId/comments', requireAuth, addComment);
router.delete('/:postId/comments/:commentId', requireAuth, deleteComment);

function isMissingPostsDimensionColumns(error: { message?: string; code?: string }): boolean {
  const m = String(error.message ?? '').toLowerCase();
  return (
    m.includes('media_width') ||
    m.includes('media_height') ||
    (m.includes('column') && m.includes('does not exist')) ||
    error.code === '42703'
  );
}

export async function getFeed(req: AuthRequest, res: Response) {
  const cursor = req.query.cursor as string | undefined;

  const { data, error } = await supabaseAdmin.rpc('get_friend_feed', {
    p_user_id: req.userId,
    p_limit: 20,
    ...(cursor ? { p_cursor: cursor } : {}),
  });

  if (error) return res.status(500).json({ error: error.message, data: null });

  const lastPost = data?.[data.length - 1];

  // RPC returns `post_id` + `author_id`; frontend expects `id` + `user_id` and nested `author`.
  const mapped = (data ?? []).map((row: any) => ({
    ...row,
    id: row.post_id,
    user_id: row.author_id,
    author: {
      id: row.author_id,
      username: row.username,
      display_name: row.display_name,
      profile_picture_url: row.profile_picture_url,
    },
  }));

  return res.json({
    data: mapped,
    cursor: lastPost?.created_at ?? null,
    has_more: (data?.length ?? 0) === 20,
    error: null,
  });
}

export async function createPost(req: AuthRequest, res: Response) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No media file provided', data: null });

  const { caption, visibility = 'friends', music_id } = req.body as {
    caption?: string;
    visibility?: string;
    music_id?: string;
  };

  const mediaType = file.mimetype.startsWith('video/') ? 'video' : 'image';

  let processed: Awaited<ReturnType<typeof mediaService.processAndUpload>>;
  try {
    processed = await mediaService.processAndUpload(file as any, req.userId!, mediaType);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Media processing failed';
    return res.status(500).json({ error: msg, data: null });
  }

  const { mediaUrl, thumbnailUrl, durationSec, mediaWidth, mediaHeight } = processed;

  const rowBase = {
    user_id: req.userId,
    media_url: mediaUrl,
    media_type: mediaType,
    thumbnail_url: thumbnailUrl,
    duration_sec: durationSec,
    caption: caption ?? null,
    visibility,
    music_id: music_id ?? null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const db = createSupabaseUserClient(req.accessToken!);

  let { data, error } = await db
    .from('posts')
    .insert({
      ...rowBase,
      media_width: mediaWidth,
      media_height: mediaHeight,
    })
    .select('*, author:users!user_id(id, username, display_name, profile_picture_url)')
    .single();

  // Older DBs without migration 15_post_media_dimensions.sql — retry without dimension columns.
  if (error && isMissingPostsDimensionColumns(error)) {
    ({ data, error } = await db
      .from('posts')
      .insert(rowBase)
      .select('*, author:users!user_id(id, username, display_name, profile_picture_url)')
      .single());
  }

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.status(201).json({ data, error: null });
}

export async function deletePost(req: AuthRequest, res: Response) {
  const { postId } = req.params;

  const db = createSupabaseUserClient(req.accessToken!);

  const { error } = await db
    .from('posts')
    .update({ is_deleted: true })
    .eq('id', postId)
    .eq('user_id', req.userId);

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data: { message: 'Deleted' }, error: null });
}

export async function likePost(req: AuthRequest, res: Response) {
  const { postId } = req.params;

  const db = createSupabaseUserClient(req.accessToken!);

  const { error } = await db
    .from('post_likes')
    .insert({ post_id: postId, user_id: req.userId });

  if ((error as any)?.code === '23505') {
    return res.status(409).json({ error: 'Already liked', data: null });
  }

  if (error) return res.status(500).json({ error: (error as any).message, data: null });
  return res.json({ data: { liked: true }, error: null });
}

export async function unlikePost(req: AuthRequest, res: Response) {
  const { postId } = req.params;
  const db = createSupabaseUserClient(req.accessToken!);
  await db
    .from('post_likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', req.userId);

  return res.json({ data: { liked: false }, error: null });
}

export async function recordView(req: AuthRequest, res: Response) {
  const { postId } = req.params;
  const db = createSupabaseUserClient(req.accessToken!);
  const { error } = await db.from('post_views').insert({ post_id: postId, viewer_id: req.userId });
  // Best-effort: RLS or duplicate views should not surface as 5xx to the client.
  if (error && process.env.NODE_ENV !== 'production') {
    console.warn('[recordView]', postId, error.message);
  }
  return res.status(204).send();
}

export async function getComments(req: AuthRequest, res: Response) {
  const { postId } = req.params;
  const db = createSupabaseUserClient(req.accessToken!);

  const { data, error } = await db
    .from('post_comments')
    .select('*, author:users!user_id(id, username, display_name, profile_picture_url)')
    .eq('post_id', postId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message, data: null });
  if (!data?.length) {
    const { data: canSee } = await db.from('posts').select('id').eq('id', postId).maybeSingle();
    if (!canSee) return res.status(404).json({ error: 'Post not found', data: null });
  }
  return res.json({ data: data ?? [], error: null });
}

export async function getPost(req: AuthRequest, res: Response) {
  const { postId } = req.params;
  const db = createSupabaseUserClient(req.accessToken!);

  const { data: post, error } = await db
    .from('posts')
    .select('*, author:users!user_id(id, username, display_name, profile_picture_url)')
    .eq('id', postId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error || !post) return res.status(404).json({ error: 'Post not found', data: null });

  const { data: likeRow } = await db
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', req.userId)
    .maybeSingle();

  return res.json({
    data: {
      ...post,
      user_has_liked: !!likeRow,
    },
    error: null,
  });
}

export async function addComment(req: AuthRequest, res: Response) {
  const { postId } = req.params;

  const schema = z.object({ body: z.string().min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid comment', data: null });

  const db = createSupabaseUserClient(req.accessToken!);

  const { data, error } = await db
    .from('post_comments')
    .insert({ post_id: postId, user_id: req.userId, body: parsed.data.body })
    .select('*, author:users!user_id(id, username, display_name, profile_picture_url)')
    .single();

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.status(201).json({ data, error: null });
}

export async function deleteComment(req: AuthRequest, res: Response) {
  const { postId, commentId } = req.params;

  const db = createSupabaseUserClient(req.accessToken!);
  await db
    .from('post_comments')
    .update({ is_deleted: true })
    .eq('id', commentId)
    .eq('post_id', postId)
    .eq('user_id', req.userId);

  return res.json({ data: { deleted: true }, error: null });
}

export default router;
