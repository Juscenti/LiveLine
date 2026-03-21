// ============================================================
// middleware/auth.ts — JWT verification via Supabase
// ============================================================
import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';

export interface AuthRequest extends Request {
  userId?: string;
  userAuthId?: string;
  accessToken?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const rawAuth = req.headers.authorization;
  const token = (rawAuth?.replace(/^Bearer\s+/i, '') ?? '').trim();

  // #region agent log
  fetch('http://127.0.0.1:7393/ingest/3b33b110-61a6-45ae-9299-a69f0711fe19', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd26f09' },
    body: JSON.stringify({
      sessionId: 'd26f09',
      hypothesisId: 'H2',
      location: 'middleware/auth.ts:requireAuth:entry',
      message: 'requireAuth entry',
      data: {
        method: req.method,
        path: req.path,
        baseUrl: req.baseUrl,
        originalUrl: req.originalUrl,
        userIdParam: (req.params as { userId?: string })?.userId,
        hasAuthHeader: !!rawAuth,
        tokenLen: token?.length ?? 0,
        bearerSchemeLooksLower: /^bearer\s/i.test(rawAuth ?? '') && !rawAuth?.startsWith('Bearer '),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', data: null });
  }

  try {
    // Verify JWT via Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    // #region agent log
    fetch('http://127.0.0.1:7393/ingest/3b33b110-61a6-45ae-9299-a69f0711fe19', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd26f09' },
      body: JSON.stringify({
        sessionId: 'd26f09',
        hypothesisId: 'H1',
        location: 'middleware/auth.ts:requireAuth:afterGetUser',
        message: 'getUser result',
        data: {
          path: req.path,
          getUserErr: error?.message ?? null,
          hasUser: !!user,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token', data: null });
    }

    // Look up public.users record
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7393/ingest/3b33b110-61a6-45ae-9299-a69f0711fe19', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd26f09' },
      body: JSON.stringify({
        sessionId: 'd26f09',
        hypothesisId: 'H3',
        location: 'middleware/auth.ts:requireAuth:afterProfile',
        message: 'profile lookup',
        data: {
          path: req.path,
          profileErr: profileErr?.message ?? null,
          hasProfile: !!profile,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (profileErr || !profile) {
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
