import { Router } from 'express';
import { z } from 'zod';
import { counterLimiter } from '../limits.js';
import { db } from '../db.js';
import { serializeBusiness, serializeLink } from '../serializers.js';
import { recordClick, recordView } from '../stats.js';
import { publicTracking } from '../tracking.js';
import { HttpError, parseId } from '../util.js';

const router = Router();

// Everything here is unauthenticated. Always revalidate so a newly added link shows up straight away.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  next();
});

function toPublicBusiness(row) {
  const b = serializeBusiness(row);
  return {
    name: b.name,
    slug: b.slug,
    tagline: b.tagline,
    bio: b.bio,
    logoUrl: b.logoUrl,
    coverUrl: b.coverUrl,
    theme: b.theme,
  };
}

const activeBySlug = db.prepare('SELECT * FROM businesses WHERE slug = ? AND is_active = 1');

// Directory of every published business.
router.get('/businesses', (_req, res) => {
  const rows = db.prepare('SELECT * FROM businesses WHERE is_active = 1 ORDER BY name COLLATE NOCASE').all();
  res.json({ businesses: rows.map(toPublicBusiness) });
});

router.get('/businesses/:slug', (req, res) => {
  const row = activeBySlug.get(req.params.slug);
  if (!row) throw new HttpError(404, 'This page could not be found');
  const links = db
    .prepare('SELECT * FROM links WHERE business_id = ? AND is_active = 1 ORDER BY position, id')
    .all(row.id)
    .map((l) => {
      const { id, platform, title, url, display } = serializeLink(l);
      return { id, platform, title, url, display };
    });
  res.json({ business: toPublicBusiness(row), links, tracking: publicTracking(row) });
});

const viewBody = z.object({
  referrer: z.string().max(500).optional(),
  utm: z.string().max(100).optional(),
});

// Called once by the page after it loads. Recorded per business (views, anonymous daily visitors, source, device).
router.post('/businesses/:slug/view', counterLimiter, (req, res) => {
  const row = activeBySlug.get(req.params.slug);
  const body = viewBody.safeParse(req.body ?? {});
  if (row) recordView(row.id, req, body.success ? body.data : {});
  res.status(204).end();
});

const activeLink = db.prepare(
  `SELECT l.id, l.business_id FROM links l JOIN businesses b ON b.id = l.business_id
    WHERE l.id = ? AND l.is_active = 1 AND b.is_active = 1`,
);

// Called when a visitor taps a link. Recorded per link, so every link has its own count and history.
router.post('/links/:id/click', counterLimiter, (req, res) => {
  const link = activeLink.get(parseId(req.params.id));
  if (link) recordClick(link, req);
  res.status(204).end();
});

export default router;
