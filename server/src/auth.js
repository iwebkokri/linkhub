import { config } from './config.js';
import { db } from './db.js';
import { HttpError } from './util.js';
import { randomToken, sha256 } from './secrets.js';

export const COOKIE_NAME = 'lt_session';

// ---- sessions --------------------------------------------------------------------------------
// The cookie holds a random token. The database holds only its SHA-256, plus when the session
// started, was last used and expires. Deleting the row = that device is signed out, instantly.

const insertSession = db.prepare(
  'INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
);
const findSession = db.prepare(
  'SELECT s.id AS sid, s.last_seen, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?',
);
const touchSession = db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?');
const deleteSession = db.prepare('DELETE FROM sessions WHERE id = ?');

function cookieOptions(req) {
  const secure = config.cookieSecure === 'auto' ? req.secure : config.cookieSecure === 'true';
  // SameSite=Strict: the browser never attaches the cookie to a request started by another site.
  return { httpOnly: true, sameSite: 'strict', secure, maxAge: config.sessionMaxMs, path: '/' };
}

export function startSession(req, res, userId) {
  const token = randomToken(32);
  const now = Date.now();
  insertSession.run(sha256(token), userId, now, now, now + config.sessionMaxMs, req.ip ?? null, (req.get('user-agent') || '').slice(0, 300));
  res.cookie(COOKIE_NAME, token, cookieOptions(req));
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function endCurrentSession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token === 'string') deleteSession.run(sha256(token));
  clearSessionCookie(res);
}

/** Sign a user out everywhere (optionally keeping one session, e.g. the one that just changed the password). */
export function endUserSessions(userId, exceptSessionId = null) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, exceptSessionId ?? '');
}

export function purgeSessions() {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR last_seen < ?').run(now, now - config.sessionIdleMs);
}

export function listSessions(userId, currentId) {
  return db
    .prepare('SELECT id, created_at, last_seen, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen DESC')
    .all(userId)
    .map((s) => ({
      id: s.id.slice(0, 12), // enough to tell them apart; not enough to be a credential
      current: s.id === currentId,
      createdAt: new Date(s.created_at).toISOString(),
      lastSeen: new Date(s.last_seen).toISOString(),
      ip: s.ip,
      userAgent: s.user_agent,
    }));
}

function authenticate(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw new HttpError(401, 'Please sign in');

  const row = findSession.get(sha256(token));
  const now = Date.now();
  const expired = !row || row.expires_at <= now || now - row.last_seen > config.sessionIdleMs;
  if (expired || !row.is_active) {
    if (row) deleteSession.run(row.sid);
    clearSessionCookie(res);
    throw new HttpError(401, expired ? 'Your session has expired. Please sign in again' : 'Your account is not active');
  }
  if (now - row.last_seen > 60_000) touchSession.run(now, row.sid); // sliding idle timeout, without a write on every request

  const { sid, last_seen: _seen, expires_at: _exp, ...user } = row;
  req.user = user;
  req.sessionId = sid;
}

/** What still has to happen before this person may use the app: 'password' and/or '2fa'. */
export function setupNeeded(user) {
  const needs = [];
  if (user.must_change_password) needs.push('password');
  if (config.require2faAdmins && user.role === 'admin' && !user.totp_enabled) needs.push('2fa');
  return needs;
}

/** Normal protection: a valid session AND a finished account setup. */
export function requireAuth(req, res, next) {
  authenticate(req, res);
  const needs = setupNeeded(req.user);
  if (needs.length) throw new HttpError(403, 'Please finish setting up your account first', { code: 'SETUP_REQUIRED', needs });
  next();
}

/** For the few endpoints a person must reach *during* setup (change password, enrol 2FA, who am I, sign out). */
export function requireAuthForSetup(req, res, next) {
  authenticate(req, res);
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') throw new HttpError(403, 'Administrator access required');
  next();
}

const memberRow = db.prepare('SELECT 1 FROM business_members WHERE business_id = ? AND user_id = ?');
const businessExists = db.prepare('SELECT 1 FROM businesses WHERE id = ?');

/** Admins can touch any business; members only the ones they are assigned to. */
export function assertBusinessAccess(user, businessId) {
  if (!businessExists.get(businessId)) throw new HttpError(404, 'Business not found');
  if (user.role === 'admin') return;
  if (!memberRow.get(businessId, user.id)) {
    throw new HttpError(403, 'You are not assigned to this business');
  }
}
