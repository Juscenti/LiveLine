// ============================================================
// src/index.ts — Express server entry point
// ============================================================
import 'dotenv/config';
import express from 'express';
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

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

// ── Security middleware ──────────────────────────────────────
app.use(helmet());
app.use(cors({
  // Native mobile apps don't use browser CORS rules, but axios/xhr/web do.
  // Using `origin: true` reflects the incoming `Origin` header and prevents
  // Render/Expo environments from being blocked.
  origin: true,
  credentials: true,
}));

// ── Rate limiting ────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 900_000),
  max:      Number(process.env.RATE_LIMIT_MAX ?? 100),
  standardHeaders: true,
  legacyHeaders: false,
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

// ── Error handler (must be last) ─────────────────────────────
app.use(errorHandler);

// Bind to all interfaces so the phone can reach the API over LAN.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Liveline API running on http://0.0.0.0:${PORT}`);
});

export default app;
