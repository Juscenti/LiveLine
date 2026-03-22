// ============================================================
// Server logging — readable in Railway / Docker / terminal
// ============================================================

const ts = () => new Date().toISOString();

/** Log a line always (use for startup, config warnings). */
export function logInfo(scope: string, message: string, meta?: Record<string, unknown>): void {
  if (meta && Object.keys(meta).length > 0) {
    console.log(`[${ts()}] [${scope}] ${message}`, meta);
  } else {
    console.log(`[${ts()}] [${scope}] ${message}`);
  }
}

/** Log errors with optional stack (never log tokens or secrets). */
export function logError(scope: string, message: string, err?: unknown, meta?: Record<string, unknown>): void {
  const base = { ...meta };
  if (err instanceof Error) {
    Object.assign(base, {
      errName: err.name,
      errMessage: err.message,
      stack: err.stack,
    });
  } else if (err !== undefined) {
    base.err = String(err);
  }
  console.error(`[${ts()}] [${scope}] ${message}`, base);
}

/** Supabase / PostgREST style errors from @supabase/supabase-js */
export function logSupabase(
  route: string,
  operation: string,
  error: { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
): void {
  if (!error) return;
  console.error(`[${ts()}] [Supabase] ${route} ${operation}`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}
