import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { assertBusinessAccess, requireAuth } from '../auth.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { linkCreateSchema, linkUpdateSchema } from '../schemas.js';
import { normalizeTarget } from '../platforms.js';
import { serializeLink } from '../serializers.js';
import { HttpError, parseId } from '../util.js';

// Mounted at /api. Auth is applied per route (not router.use) so unknown /api paths still 404.
const router = Router();

const getLink = db.prepare('SELECT * FROM links WHERE id = ?');
const businessSlug = (id) => db.prepare('SELECT slug FROM businesses WHERE id = ?').get(id)?.slug ?? String(id);

router.get('/businesses/:id/links', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  assertBusinessAccess(req.user, id);
  const rows = db.prepare('SELECT * FROM links WHERE business_id = ? ORDER BY position, id').all(id);
  res.json({ links: rows.map(serializeLink) });
});

router.post('/businesses/:id/links', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  assertBusinessAccess(req.user, id);
  const data = linkCreateSchema.parse(req.body);
  const url = normalizeTarget(data.platform, data.url);

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM links WHERE business_id = ?').get(id);
  if (count >= config.maxLinksPerBusiness) {
    throw new HttpError(400, `A business can have at most ${config.maxLinksPerBusiness} links`);
  }

  const { next } = db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM links WHERE business_id = ?')
    .get(id);
  const linkId = db
    .prepare(
      'INSERT INTO links (business_id, platform, title, url, display, is_active, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, data.platform, data.title, url, data.display ?? 'button', (data.isActive ?? true) ? 1 : 0, next)
    .lastInsertRowid;
  audit(req, 'link.created', businessSlug(id), { title: data.title, platform: data.platform, url });
  res.status(201).json({ link: serializeLink(getLink.get(linkId)) });
});

// Must be a PUT on a fixed path; the client sends every link id in the new order.
router.put('/businesses/:id/links/order', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  assertBusinessAccess(req.user, id);
  const { ids } = z.object({ ids: z.array(z.number().int().positive()).max(1000) }).parse(req.body);

  const existing = db.prepare('SELECT id FROM links WHERE business_id = ?').all(id).map((r) => r.id);
  const same = ids.length === existing.length && new Set(ids).size === ids.length && ids.every((i) => existing.includes(i));
  if (!same) throw new HttpError(400, 'The new order must include every link exactly once');

  db.transaction(() => {
    const upd = db.prepare('UPDATE links SET position = ? WHERE id = ? AND business_id = ?');
    ids.forEach((linkId, index) => upd.run(index, linkId, id));
  })();

  const rows = db.prepare('SELECT * FROM links WHERE business_id = ? ORDER BY position, id').all(id);
  res.json({ links: rows.map(serializeLink) });
});

router.put('/links/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  const current = getLink.get(id);
  if (!current) throw new HttpError(404, 'Link not found');
  assertBusinessAccess(req.user, current.business_id);

  const data = linkUpdateSchema.parse(req.body);
  const platform = data.platform ?? current.platform;
  // Re-validate the target whenever the URL or the platform changes (e.g. website -> email).
  const url = data.url !== undefined || data.platform ? normalizeTarget(platform, data.url ?? current.url) : current.url;

  db.prepare(
    `UPDATE links
        SET platform = ?, title = ?, url = ?, display = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?`,
  ).run(
    platform,
    data.title ?? current.title,
    url,
    data.display ?? current.display,
    (data.isActive ?? !!current.is_active) ? 1 : 0,
    id,
  );
  const changes = {};
  if (url !== current.url) changes.url = { from: current.url, to: url };
  if (data.title !== undefined && data.title !== current.title) changes.title = data.title;
  if (platform !== current.platform) changes.platform = platform;
  if (data.isActive !== undefined && data.isActive !== !!current.is_active) changes.visible = data.isActive;
  if (data.display !== undefined && data.display !== current.display) changes.display = data.display;
  if (Object.keys(changes).length) audit(req, 'link.updated', businessSlug(current.business_id), { link: current.title, ...changes });
  res.json({ link: serializeLink(getLink.get(id)) });
});

router.delete('/links/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  const current = getLink.get(id);
  if (!current) throw new HttpError(404, 'Link not found');
  assertBusinessAccess(req.user, current.business_id);
  db.prepare('DELETE FROM links WHERE id = ?').run(id);
  audit(req, 'link.deleted', businessSlug(current.business_id), { title: current.title, url: current.url });
  res.json({ ok: true });
});

export default router;
