import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
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

  // Create Supabase auth user
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr || !authData.user) {
    return res.status(400).json({ error: authErr?.message ?? 'Registration failed', data: null });
  }

  // Update the auto-created profile with the desired username
  await supabaseAdmin
    .from('users')
    .update({ username: username.toLowerCase(), email })
    .eq('auth_id', authData.user.id);

  // Sign in immediately so the client can create a session without using the (anon) client key.
  const { data: signInData, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signInData.session) {
    return res.status(400).json({ error: signInErr?.message ?? 'Registration succeeded but sign-in failed', data: null });
  }

  return res.status(201).json({
    data: {
      session: signInData.session,
      user: signInData.user,
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

  return res.json({ data: { session: data.session, user: data.user }, error: null });
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

