import { Router } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
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

// ---- QR code that opens this business' page ---------------------------------------------------
// GET /api/public/businesses/:slug/qr?format=svg|png&size=128..2000&download=1
// The code encodes  <your domain>/<slug>?utm_source=qr  so scans show up in Analytics as the source "qr".
const QR_COLORS = { dark: '#000000', light: '#ffffff' }; // black on white: the most reliably scannable
const qrCache = new Map(); // generated images by (format, size, address); tiny, and capped
const QR_CACHE_MAX = 200;

router.get('/businesses/:slug/qr', counterLimiter, async (req, res) => {
  const row = activeBySlug.get(req.params.slug);
  if (!row) throw new HttpError(404, 'This page could not be found');

  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  const target = `${base}/${row.slug}?utm_source=qr`;
  const format = req.query.format === 'png' ? 'png' : 'svg';
  const size = Math.min(Math.max(parseInt(req.query.size, 10) || 600, 128), 2000);

  const key = `${format}:${size}:${target}`;
  let body = qrCache.get(key);
  if (!body) {
    const opts = { margin: 2, errorCorrectionLevel: 'Q', color: QR_COLORS };
    body = format === 'png'
      ? await QRCode.toBuffer(target, { ...opts, width: size })
      : await QRCode.toString(target, { ...opts, type: 'svg' });
    if (qrCache.size >= QR_CACHE_MAX) qrCache.clear();
    qrCache.set(key, body);
  }

  res.vary('Host');
  res.set('Cache-Control', 'public, max-age=3600'); // overrides the router-wide no-cache: it only depends on slug + host
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  if (req.query.download) res.set('Content-Disposition', `attachment; filename="${row.slug}-qr.${format}"`);
  res.type(format === 'png' ? 'image/png' : 'image/svg+xml').send(body);
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
