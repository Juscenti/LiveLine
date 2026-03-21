import type { Request, Response, NextFunction } from 'express';

const isProd = process.env.NODE_ENV === 'production';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error('[Error]', err);
  const status = err.status ?? err.statusCode ?? 500;
  const raw = err.message ?? 'Internal server error';
  const message =
    isProd && status >= 500 ? 'Internal server error' : raw;
  res.status(status).json({ error: message, data: null });
}

