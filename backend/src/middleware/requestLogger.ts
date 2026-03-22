import type { Request, Response, NextFunction } from 'express';

/**
 * Request/response logging for production debugging (Railway / host logs).
 * - Logs every request on `finish`: method, URL, status, duration.
 * - Logs JSON error bodies when status >= 400 (so Supabase/API errors appear in logs).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  const origJson = res.json.bind(res);
  res.json = function logJsonBody(body: unknown) {
    const code = res.statusCode;
    if (code >= 400 && body !== null && body !== undefined) {
      const payload = body as { error?: string; data?: unknown };
      const errPart = payload?.error != null ? String(payload.error) : JSON.stringify(body).slice(0, 800);
      console.error(
        `[${new Date().toISOString()}] [API ${code}] ${req.method} ${req.originalUrl} body.error=${errPart}`,
      );
    }
    return origJson(body);
  };

  res.on('finish', () => {
    const ms = Date.now() - start;
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`;
    if (res.statusCode >= 400) {
      console.error(`[${new Date().toISOString()}] [HTTP] ${line}`);
    } else {
      console.log(`[${new Date().toISOString()}] [HTTP] ${line}`);
    }
  });

  next();
}
