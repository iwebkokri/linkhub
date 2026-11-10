import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { assertBusinessAccess, requireAuth } from '../auth.js';
import { businessReport, overviewReport } from '../stats.js';
import { parseId } from '../util.js';

// Mounted at /api. Auth is applied per route so unknown /api paths still 404.
const router = Router();

const daysParam = z.coerce.number().int().min(1).max(365).catch(30);

// Totals + daily history + per-link clicks for ONE business.
router.get('/businesses/:id/analytics', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  assertBusinessAccess(req.user, id);
  res.json(businessReport(id, daysParam.parse(req.query.days)));
});

// Roll-up over every business the signed-in user can see (all of them for admins).
router.get('/analytics/overview', requireAuth, (req, res) => {
  const ids =
    req.user.role === 'admin'
      ? db.prepare('SELECT id FROM businesses').all().map((r) => r.id)
      : db.prepare('SELECT business_id AS id FROM business_members WHERE user_id = ?').all(req.user.id).map((r) => r.id);
  res.json(overviewReport(ids, daysParam.parse(req.query.days)));
});

export default router;
