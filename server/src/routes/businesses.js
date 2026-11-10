import { Router } from 'express';
import { z } from 'zod';
import { db, isUniqueViolation } from '../db.js';
import { assertBusinessAccess, requireAdmin, requireAuth } from '../auth.js';
import { DEFAULT_THEME, businessCreateSchema, businessUpdateSchema } from '../schemas.js';
import { serializeBusiness, serializeLink } from '../serializers.js';
import { HttpError, RESERVED_SLUGS, parseId, removeUploadByUrl, slugify } from '../util.js';
import { memberIdsOf, setBusinessMembers } from '../members.js';
import { imageUpload, verifySavedImage } from '../uploads.js';
import { audit } from '../audit.js';

const router = Router();
router.use(requireAuth);

const LIST_SQL = `
  SELECT b.*,
    (SELECT COUNT(*) FROM links l WHERE l.business_id = b.id)                 AS link_count,
    (SELECT COALESCE(SUM(l.clicks), 0) FROM links l WHERE l.business_id = b.id) AS clicks,
    (SELECT COUNT(*) FROM business_members m WHERE m.business_id = b.id)      AS member_count
  FROM businesses b`;

const getBusiness = db.prepare('SELECT * FROM businesses WHERE id = ?');

function slugTaken(slug) {
  return RESERVED_SLUGS.has(slug) || !!db.prepare('SELECT 1 FROM businesses WHERE slug = ?').get(slug);
}

function uniqueSlug(base) {
  let slug = base;
  for (let i = 2; slugTaken(slug); i++) slug = `${base.slice(0, 46)}-${i}`;
  return slug;
}

// ---- list / create ---------------------------------------------------------

router.get('/', (req, res) => {
  const rows =
    req.user.role === 'admin'
      ? db.prepare(`${LIST_SQL} ORDER BY b.name COLLATE NOCASE`).all()
      : db
          .prepare(
            `${LIST_SQL}
             WHERE b.id IN (SELECT business_id FROM business_members WHERE user_id = ?)
             ORDER BY b.name COLLATE NOCASE`,
          )
          .all(req.user.id);
  res.json({ businesses: rows.map(serializeBusiness) });
});

router.post('/', requireAdmin, (req, res) => {
  const data = businessCreateSchema.parse(req.body);
  const slug = data.slug ?? uniqueSlug(slugify(data.name) || 'business');
  if (data.slug && slugTaken(slug)) throw new HttpError(409, 'That page URL is already taken');

  let id;
  try {
    id = db
      .prepare('INSERT INTO businesses (name, slug, tagline, bio, theme) VALUES (?, ?, ?, ?, ?)')
      .run(data.name, slug, data.tagline ?? '', data.bio ?? '', JSON.stringify(DEFAULT_THEME)).lastInsertRowid;
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'That page URL is already taken');
    throw err;
  }
  audit(req, 'business.created', slug, { name: data.name });
  res.status(201).json({ business: serializeBusiness(getBusiness.get(id)) });
});

// ---- single business -------------------------------------------------------

router.get('/:id', (req, res) => {
  const id = parseId(req.params.id);
  assertBusinessAccess(req.user, id);
  const links = db.prepare('SELECT * FROM links WHERE business_id = ? ORDER BY position, id').all(id);
  const body = {
    business: serializeBusiness(getBusiness.get(id), { withTracking: req.user.role === 'admin' }),
    links: links.map(serializeLink),
  };
  if (req.user.role === 'admin') body.memberIds = memberIdsOf(id);
  res.json(body);
});

router.put('/:id', (req, res) => {
  const id = parseId(req.params.id);
  assertBusinessAccess(req.user, id);
  const data = businessUpdateSchema.parse(req.body);

  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && ('slug' in data || 'isActive' in data)) {
    throw new HttpError(403, 'Only an administrator can change the page URL or publish/unpublish a page');
  }
  if (!isAdmin && 'tracking' in data) {
    throw new HttpError(403, 'Only an administrator can change tracking codes');
  }

  const current = serializeBusiness(getBusiness.get(id), { withTracking: true });
  if (data.slug && data.slug !== current.slug.toLowerCase() && slugTaken(data.slug)) {
    throw new HttpError(409, 'That page URL is already taken');
  }
  const theme = { ...current.theme, ...(data.theme || {}) };
  const tracking = { ...current.tracking, ...(data.tracking || {}) };

  try {
    db.prepare(
      `UPDATE businesses
          SET name = ?, slug = ?, tagline = ?, bio = ?, theme = ?, tracking = ?, is_active = ?, updated_at = datetime('now')
        WHERE id = ?`,
    ).run(
      data.name ?? current.name,
      data.slug ?? current.slug,
      data.tagline ?? current.tagline,
      data.bio ?? current.bio,
      JSON.stringify(theme),
      JSON.stringify(tracking),
      (data.isActive ?? current.isActive) ? 1 : 0,
      id,
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'That page URL is already taken');
    throw err;
  }

  const changed = ['name', 'slug', 'tagline', 'bio'].filter((k) => data[k] !== undefined && data[k] !== current[k]);
  if (data.theme && JSON.stringify(theme) !== JSON.stringify(current.theme)) changed.push('theme');
  if (data.isActive !== undefined && data.isActive !== current.isActive) changed.push(data.isActive ? 'published' : 'unpublished');
  if (changed.length) audit(req, 'business.updated', data.slug ?? current.slug, changed.join(', '));
  if (data.tracking && JSON.stringify(tracking) !== JSON.stringify(current.tracking)) {
    audit(req, 'business.tracking_changed', data.slug ?? current.slug, { before: current.tracking, after: tracking });
  }
  res.json({ business: serializeBusiness(getBusiness.get(id), { withTracking: isAdmin }) });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = parseId(req.params.id);
  const row = getBusiness.get(id);
  if (!row) throw new HttpError(404, 'Business not found');
  db.prepare('DELETE FROM businesses WHERE id = ?').run(id); // links + assignments cascade
  removeUploadByUrl(row.logo_url);
  removeUploadByUrl(row.cover_url);
  audit(req, 'business.deleted', row.slug, { name: row.name });
  res.json({ ok: true });
});

// ---- logo / cover image ----------------------------------------------------

const IMAGE_COLUMNS = { logo: 'logo_url', cover: 'cover_url' };

function imageColumn(req) {
  const col = IMAGE_COLUMNS[req.params.kind];
  if (!col) throw new HttpError(404, 'Unknown image type');
  return col;
}

router.post(
  '/:id/images/:kind',
  (req, _res, next) => {
    // Authorise *before* any bytes are written to disk.
    imageColumn(req);
    assertBusinessAccess(req.user, parseId(req.params.id));
    next();
  },
  imageUpload,
  async (req, res) => {
    const col = imageColumn(req);
    const id = parseId(req.params.id);
    if (!req.file) throw new HttpError(400, 'No image was uploaded');
    await verifySavedImage(req.file);

    const old = getBusiness.get(id)[col];
    db.prepare(`UPDATE businesses SET ${col} = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(`/uploads/${req.file.filename}`, id);
    removeUploadByUrl(old);
    audit(req, 'business.image_changed', getBusiness.get(id).slug, req.params.kind);
    res.json({ business: serializeBusiness(getBusiness.get(id)) });
  },
);

router.delete('/:id/images/:kind', (req, res) => {
  const col = imageColumn(req);
  const id = parseId(req.params.id);
  assertBusinessAccess(req.user, id);
  const old = getBusiness.get(id)[col];
  db.prepare(`UPDATE businesses SET ${col} = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
  removeUploadByUrl(old);
  audit(req, 'business.image_removed', getBusiness.get(id).slug, req.params.kind);
  res.json({ business: serializeBusiness(getBusiness.get(id)) });
});

// ---- team assignment (admin only) -----------------------------------------

router.get('/:id/members', requireAdmin, (req, res) => {
  const id = parseId(req.params.id);
  assertBusinessAccess(req.user, id);
  res.json({ userIds: memberIdsOf(id) });
});

router.put('/:id/members', requireAdmin, (req, res) => {
  const id = parseId(req.params.id);
  assertBusinessAccess(req.user, id);
  const { userIds } = z.object({ userIds: z.array(z.number().int().positive()).max(1000) }).parse(req.body);
  setBusinessMembers(id, userIds, req.user.id);
  audit(req, 'business.members_changed', getBusiness.get(id).slug, { userIds });
  res.json({ userIds: memberIdsOf(id) });
});

export default router;
