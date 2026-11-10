import { db } from './db.js';

const insert = db.prepare(
  'INSERT INTO audit_log (user_id, user_email, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
);

/**
 * Record who did what. Never pass secrets (passwords, codes, tokens) as `detail`.
 * `actor` defaults to the signed-in user; pass { email } for events before sign-in.
 */
export function audit(req, action, target = null, detail = null, actor = req?.user) {
  try {
    const text = detail == null ? null : (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500);
    insert.run(actor?.id ?? null, actor?.email ?? null, action, target == null ? null : String(target).slice(0, 200), text, req?.ip ?? null);
  } catch (err) {
    console.error('[audit] could not write entry:', err.message); // never let logging break a request
  }
}

export function listAudit({ limit = 100, beforeId = null, category = '' } = {}) {
  const where = [];
  const args = [];
  if (beforeId) {
    where.push('id < ?');
    args.push(beforeId);
  }
  if (category) {
    where.push('action LIKE ?');
    args.push(`${category.replace(/[^a-z_]/g, '')}.%`);
  }
  const rows = db
    .prepare(`SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`)
    .all(...args, Math.min(Math.max(limit, 1), 200));
  return rows.map((r) => ({
    id: r.id,
    time: r.ts.replace(' ', 'T') + 'Z', // stored in UTC
    userId: r.user_id,
    userEmail: r.user_email,
    action: r.action,
    target: r.target,
    detail: r.detail,
    ip: r.ip,
  }));
}

export function pruneAudit(days) {
  if (!days) return;
  db.prepare("DELETE FROM audit_log WHERE ts < datetime('now', ?)").run(`-${days} days`);
}
