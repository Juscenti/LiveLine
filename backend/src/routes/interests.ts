import { Router } from 'express';
import type { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (_req: AuthRequest, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('interests')
    .select('*')
    .order('category')
    .order('name');

  if (error) return res.status(500).json({ error: error.message, data: null });
  return res.json({ data, error: null });
});

export default router;

