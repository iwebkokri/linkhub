import { Router } from 'express';
import { z } from 'zod';
import { listAudit } from '../audit.js';
import { requireAdmin, requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const query = z.object({
  limit: z.coerce.number().int().min(1).max(200).catch(100),
  before: z.coerce.number().int().positive().optional().catch(undefined),
  category: z.enum(['auth', 'user', 'business', 'link', 'settings']).optional().catch(undefined),
});

// Newest first. Pass the last id you received as ?before= to load older entries.
router.get('/', (req, res) => {
  const q = query.parse(req.query);
  const entries = listAudit({ limit: q.limit, beforeId: q.before, category: q.category });
  res.json({ entries, nextBefore: entries.length === q.limit ? entries[entries.length - 1].id : null });
});

export default router;
