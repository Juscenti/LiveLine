// ============================================================
// middleware/auth.ts — JWT verification via Supabase
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { getOrCreatePublicUserProfile } from '../lib/publicUserProfile';

export interface AuthRequest extends Request {
  userId?: string;
  userAuthId?: string;
  accessToken?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const rawAuth = req.headers.authorization;
  const token = (rawAuth?.replace(/^Bearer\s+/i, '') ?? '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', data: null });
  }

  try {
    // Verify JWT via Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token', data: null });
    }

    const profile = await getOrCreatePublicUserProfile(user);
    if (!profile) {
      return res.status(401).json({ error: 'User profile not found', data: null });
    }

    req.userId     = profile.id;
    req.userAuthId = user.id;
    req.accessToken = token;
    next();
  } catch {
    res.status(401).json({ error: 'Token verification failed', data: null });
  }
}

// ============================================================
// middleware/upload.ts — Multer config for media uploads
// ============================================================
import multer from 'multer';

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm',
];

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 52_428_800 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});
