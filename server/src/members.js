import { db } from './db.js';
import { HttpError } from './util.js';

function uniq(ids) {
  return [...new Set(ids)];
}

function assertAllExist(table, ids, label) {
  if (!ids.length) return;
  const found = db
    .prepare(`SELECT id FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids).length;
  if (found !== ids.length) throw new HttpError(400, `One or more ${label} do not exist`);
}

/** Replace the set of team members assigned to a business. */
export function setBusinessMembers(businessId, userIds, assignedBy) {
  userIds = uniq(userIds);
  assertAllExist('users', userIds, 'users');
  db.transaction(() => {
    const current = db
      .prepare('SELECT user_id FROM business_members WHERE business_id = ?')
      .all(businessId)
      .map((r) => r.user_id);
    for (const uid of current) {
      if (!userIds.includes(uid)) {
        db.prepare('DELETE FROM business_members WHERE business_id = ? AND user_id = ?').run(businessId, uid);
      }
    }
    for (const uid of userIds) {
      if (!current.includes(uid)) {
        db.prepare('INSERT INTO business_members (business_id, user_id, assigned_by) VALUES (?, ?, ?)')
          .run(businessId, uid, assignedBy);
      }
    }
  })();
}

/** Replace the set of businesses a team member is assigned to. */
export function setUserBusinesses(userId, businessIds, assignedBy) {
  businessIds = uniq(businessIds);
  assertAllExist('businesses', businessIds, 'businesses');
  db.transaction(() => {
    const current = db
      .prepare('SELECT business_id FROM business_members WHERE user_id = ?')
      .all(userId)
      .map((r) => r.business_id);
    for (const bid of current) {
      if (!businessIds.includes(bid)) {
        db.prepare('DELETE FROM business_members WHERE business_id = ? AND user_id = ?').run(bid, userId);
      }
    }
    for (const bid of businessIds) {
      if (!current.includes(bid)) {
        db.prepare('INSERT INTO business_members (business_id, user_id, assigned_by) VALUES (?, ?, ?)')
          .run(bid, userId, assignedBy);
      }
    }
  })();
}

export function memberIdsOf(businessId) {
  return db
    .prepare('SELECT user_id FROM business_members WHERE business_id = ?')
    .all(businessId)
    .map((r) => r.user_id);
}

export function businessIdsOf(userId) {
  return db
    .prepare('SELECT business_id FROM business_members WHERE user_id = ?')
    .all(userId)
    .map((r) => r.business_id);
}
