import { Router } from 'express';
import { audit } from '../audit.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { getGlobalTracking, globalTrackingSchema, saveGlobalTracking } from '../tracking.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Company-wide tracking codes: loaded on EVERY business page, in addition to a business' own codes.
router.get('/tracking', (_req, res) => {
  res.json({ tracking: getGlobalTracking() });
});

router.put('/tracking', (req, res) => {
  const before = getGlobalTracking();
  const patch = globalTrackingSchema.parse(req.body);
  const after = saveGlobalTracking(patch);
  if (JSON.stringify(before) !== JSON.stringify(after)) audit(req, 'settings.tracking_changed', 'company-wide', { before, after });
  res.json({ tracking: after });
});

export default router;
