import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { getOrCreatePublicUserProfile } from '../lib/publicUserProfile';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/),
});

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message, data: null });
  }

  const { email, password, username } = parsed.data;

  // Check username uniqueness
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'Username already taken', data: null });

  // `email_confirm: true` marks the email confirmed in Auth immediately (good for dev/MVP).
  // For production, require verification in Supabase (Auth → Providers → Email) and/or
  // replace this flow with sign-up + email OTP instead of auto-confirming here.
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr || !authData.user) {
    return res.status(400).json({ error: authErr?.message ?? 'Registration failed', data: null });
  }

  const ensured = await getOrCreatePublicUserProfile(authData.user);
  if (!ensured) {
    return res.status(500).json({ error: 'Account created but profile row could not be created', data: null });
  }

  const { error: updErr } = await supabaseAdmin
    .from('users')
    .update({ username: username.toLowerCase(), email: email.toLowerCase() })
    .eq('auth_id', authData.user.id);

  if (updErr) {
    return res.status(500).json({ error: updErr.message ?? 'Could not set profile username', data: null });
  }

  // Sign in immediately so the client can create a session without using the (anon) client key.
  const { data: signInData, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signInData.session) {
    return res.status(400).json({ error: signInErr?.message ?? 'Registration succeeded but sign-in failed', data: null });
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('auth_id', signInData.user.id)
    .single();

  if (profileErr || !profile) {
    return res.status(500).json({ error: 'Account created but profile row is missing', data: null });
  }

  return res.status(201).json({
    data: {
      session: signInData.session,
      user: profile,
      message: 'Account created.',
    },
    error: null,
  });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ error: 'Email and password required', data: null });

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message, data: null });

  const row = await getOrCreatePublicUserProfile(data.user);
  if (!row) {
    return res.status(500).json({ error: 'Could not load user profile', data: null });
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', row.id)
    .single();

  if (profileErr || !profile) {
    return res.status(500).json({ error: 'User profile not found', data: null });
  }

  return res.json({ data: { session: data.session, user: profile }, error: null });
}

export async function logout(_req: AuthRequest, res: Response) {
  // Client-side signout; server just acknowledges
  return res.json({ data: { message: 'Logged out' }, error: null });
}

export async function getMe(req: AuthRequest, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', req.userId)
    .single();

  if (error) return res.status(404).json({ error: 'User not found', data: null });
  return res.json({ data, error: null });
}

const router = Router();
router.post('/register', register);
router.post('/login', login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getMe);

export default router;

