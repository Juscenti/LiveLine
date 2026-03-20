import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // Centralized API error format.
  console.error('[Error]', err);
  const status = err.status ?? err.statusCode ?? 500;
  const message = err.message ?? 'Internal server error';
  res.status(status).json({ error: message, data: null });
}

