// ============================================================
// src/index.ts — Express server entry point
// ============================================================
import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import type { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes         from './routes/auth';
import usersRoutes        from './routes/users';
import postsRoutes        from './routes/posts';
import friendsRoutes      from './routes/friends';
import mapRoutes          from './routes/map';
import musicRoutes        from './routes/music';
import notificationsRoutes from './routes/notifications';
import interestsRoutes    from './routes/interests';

import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { logInfo } from './utils/logger';

const app = express();

// Railway / Render / etc. terminate TLS and set X-Forwarded-For. express-rate-limit v7+
// throws if that header exists while trust proxy is false. TRUST_PROXY=0 disables (local).
if (process.env.TRUST_PROXY !== '0') {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isFinite(hops) && hops >= 0 ? hops : 1);
}

const rawPort = Number(process.env.PORT ?? 4000);
const PORT = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 4000;

function rateLimitNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const corsAllowedOrigins = parseCorsOrigins();

// ── Security middleware ──────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Native apps, curl, server-to-server — no Origin header
      if (!origin) return callback(null, true);
      if (corsAllowedOrigins.length === 0) {
        // Dev / same-machine: reflect Origin (set CORS_ORIGINS in production for web clients)
        return callback(null, true);
      }
      if (corsAllowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
  }),
);

// ── Rate limiting ────────────────────────────────────────────
// Stricter limits on credential endpoints (shared bucket was too loose for brute force).
const authLimiter = rateLimit({
  windowMs: rateLimitNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 900_000),
  max: rateLimitNumber(process.env.AUTH_RATE_LIMIT_MAX, 25),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Tunnel / carrier NAT puts many clients behind one IP — bucket by JWT when present
 * so each logged-in user gets their own quota (still IP-based for anonymous calls).
 */
function apiRateLimitKey(req: Request): string {
  const raw = req.headers.authorization;
  if (typeof raw === 'string' && raw.startsWith('Bearer ')) {
    const token = raw.slice(7).trim();
    if (token.length > 20) {
      return crypto.createHash('sha256').update(token).digest('hex');
    }
  }
  return req.ip ?? 'unknown';
}

const limiter = rateLimit({
  windowMs: rateLimitNumber(process.env.RATE_LIMIT_WINDOW_MS, 900_000),
  max: rateLimitNumber(process.env.RATE_LIMIT_MAX, 800),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => apiRateLimitKey(req),
});

app.use((req, res, next) => {
  if (
    req.method === 'POST' &&
    (req.path === '/api/auth/login' || req.path === '/api/auth/register')
  ) {
    return authLimiter(req, res, next);
  }
  next();
});

app.use('/api/', limiter);

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ──────────────────────────────────────────────────
app.use(requestLogger);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/posts',         postsRoutes);
app.use('/api/friends',       friendsRoutes);
app.use('/api/map',           mapRoutes);
app.use('/api/music',         musicRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/interests',     interestsRoutes);

// ── 404 (logged) ─────────────────────────────────────────────
app.use((req, res) => {
  logInfo('404', `${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not found', data: null });
});

// ── Error handler (must be last) ─────────────────────────────
app.use(errorHandler);

// Bind to all interfaces so the phone can reach the API over LAN.
app.listen(PORT, '0.0.0.0', () => {
  logInfo('Startup', `Liveline API listening on http://0.0.0.0:${PORT}`, {
    nodeEnv: process.env.NODE_ENV ?? 'undefined',
    corsOriginsConfigured: corsAllowedOrigins.length > 0,
  });
});

export default app;
