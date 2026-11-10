import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, isUniqueViolation } from '../db.js';
import { audit } from '../audit.js';
import { endUserSessions, requireAdmin, requireAuth } from '../auth.js';
import { assertStrongPassword } from '../passwords.js';
import { userCreateSchema, userUpdateSchema } from '../schemas.js';
import { serializeUser } from '../serializers.js';
import { HttpError, parseId } from '../util.js';
import { businessIdsOf, setUserBusinesses } from '../members.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const getUser = db.prepare('SELECT * FROM users WHERE id = ?');

function withBusinesses(row) {
  return serializeUser(row, businessIdsOf(row.id));
}

function otherActiveAdmins(excludeId) {
  return db
    .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?")
    .get(excludeId).c;
}

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all();
  res.json({ users: rows.map(withBusinesses) });
});

router.post('/', async (req, res) => {
  const data = userCreateSchema.parse(req.body);
  assertStrongPassword(data.password, { email: data.email, name: data.name });
  const hash = await bcrypt.hash(data.password, 12);

  let id;
  try {
    // The admin chose this password, so the new person must replace it the first time they sign in.
    id = db
      .prepare('INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)')
      .run(data.name, data.email, hash, data.role).lastInsertRowid;
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'A user with that email already exists');
    throw err;
  }
  if (data.businessIds?.length) {
    try {
      setUserBusinesses(Number(id), data.businessIds, req.user.id);
    } catch (err) {
      db.prepare('DELETE FROM users WHERE id = ?').run(id); // don't leave a half-created user behind
      throw err;
    }
  }
  audit(req, 'user.created', data.email, { role: data.role, businessIds: data.businessIds ?? [] });
  res.status(201).json({ user: withBusinesses(getUser.get(id)) });
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const current = getUser.get(id);
  if (!current) throw new HttpError(404, 'User not found');
  const data = userUpdateSchema.parse(req.body);
  const isSelf = id === req.user.id;

  const nextRole = data.role ?? current.role;
  const nextActive = data.isActive ?? !!current.is_active;
  const losingAdmin = current.role === 'admin' && current.is_active && (nextRole !== 'admin' || !nextActive);
  if (losingAdmin) {
    if (isSelf) throw new HttpError(400, 'You cannot demote or deactivate your own account');
    if (otherActiveAdmins(id) === 0) throw new HttpError(400, 'There must be at least one active administrator');
  }

  const nextEmail = data.email ?? current.email;
  let hash = current.password_hash;
  let mustChange = current.must_change_password;
  if (data.password) {
    assertStrongPassword(data.password, { email: nextEmail, name: data.name ?? current.name });
    hash = await bcrypt.hash(data.password, 12);
    if (!isSelf) mustChange = 1; // the admin knows it; the owner must choose their own
  }

  const resetTwoFactor = data.resetTwoFactor === true && !!current.totp_enabled;
  try {
    db.transaction(() => {
      db.prepare(
        `UPDATE users SET name = ?, email = ?, password_hash = ?, role = ?, is_active = ?, must_change_password = ?,
                          password_changed_at = CASE WHEN ? THEN datetime('now') ELSE password_changed_at END
          WHERE id = ?`,
      ).run(data.name ?? current.name, nextEmail, hash, nextRole, nextActive ? 1 : 0, mustChange, data.password ? 1 : 0, id);
      if (resetTwoFactor) {
        db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = 0 WHERE id = ?').run(id);
        db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(id);
      }
    })();
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'A user with that email already exists');
    throw err;
  }
  if (data.businessIds) setUserBusinesses(id, data.businessIds, req.user.id);

  // Anything that changes what a person may do, or how they prove who they are, signs them out everywhere.
  const sensitiveChange =
    !!data.password || resetTwoFactor || nextRole !== current.role || nextActive !== !!current.is_active || nextEmail !== current.email;
  if (sensitiveChange) endUserSessions(id, isSelf ? req.sessionId : null);

  if (data.password) audit(req, 'user.password_reset', nextEmail);
  if (resetTwoFactor) audit(req, 'user.2fa_reset', nextEmail);
  const changed = [];
  if (nextRole !== current.role) changed.push(`role ${current.role} -> ${nextRole}`);
  if (nextActive !== !!current.is_active) changed.push(nextActive ? 'enabled' : 'disabled');
  if (nextEmail !== current.email) changed.push(`email ${current.email} -> ${nextEmail}`);
  if (data.name && data.name !== current.name) changed.push('name');
  if (data.businessIds) changed.push(`businesses: ${data.businessIds.length}`);
  if (changed.length) audit(req, 'user.updated', nextEmail, changed.join('; '));

  res.json({ user: withBusinesses(getUser.get(id)) });
});

router.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const current = getUser.get(id);
  if (!current) throw new HttpError(404, 'User not found');
  if (id === req.user.id) throw new HttpError(400, 'You cannot delete your own account');
  if (current.role === 'admin' && current.is_active && otherActiveAdmins(id) === 0) {
    throw new HttpError(400, 'There must be at least one active administrator');
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id); // sessions + recovery codes cascade
  audit(req, 'user.deleted', current.email, { role: current.role });
  res.json({ ok: true });
});

export default router;
