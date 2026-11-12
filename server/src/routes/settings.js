import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { PRECISIONS, geoStatus, getPrecision, setPrecision } from '../geo.js';
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

// How much location detail is recorded for visits and clicks: off | country | region | city.
// (The choice is applied when an event is recorded, so "off" means nothing about location is ever stored.)
router.get('/location', (_req, res) => {
  res.json({ precision: getPrecision(), database: geoStatus() });
});

router.put('/location', (req, res) => {
  const { precision } = z.object({ precision: z.enum(PRECISIONS) }).parse(req.body);
  const before = getPrecision();
  setPrecision(precision);
  if (before !== precision) audit(req, 'settings.location_changed', 'visitor location', { before, after: precision });
  res.json({ precision, database: geoStatus() });
});

export default router;
