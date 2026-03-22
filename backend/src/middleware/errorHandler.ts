import type { Request, Response, NextFunction } from 'express';
import { logError } from '../utils/logger';

const isProd = process.env.NODE_ENV === 'production';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const anyErr = err as { status?: number; statusCode?: number; message?: string; stack?: string; name?: string };

  logError('Unhandled', `${req.method} ${req.originalUrl}`, err, {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    status: anyErr.status ?? anyErr.statusCode ?? 500,
  });

  const status = anyErr.status ?? anyErr.statusCode ?? 500;
  const raw = anyErr.message ?? 'Internal server error';
  const message = isProd && status >= 500 ? 'Internal server error' : raw;
  res.status(status).json({ error: message, data: null });
}
