import { Router } from 'express';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db.js';
import { audit } from '../audit.js';
import {
  endCurrentSession, endUserSessions, listSessions, requireAuthForSetup, startSession,
} from '../auth.js';
import {
  loginAccountLimiter, loginEmailCeiling, loginIpLimiter, sensitiveLimiter, twoFactorLimiter,
} from '../limits.js';
import { assertStrongPassword } from '../passwords.js';
import { password as passwordSchema } from '../schemas.js';
import { decrypt, encrypt, randomToken } from '../secrets.js';
import { serializeUser } from '../serializers.js';
import { hashRecoveryCode, newRecoveryCodes, newTotpSecret, otpauthUri, verifyTotp } from '../totp.js';
import { HttpError } from '../util.js';

const router = Router();

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const getUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');

// ---- second factor ---------------------------------------------------------------------------

/** Checks a 6-digit authenticator code or a one-time recovery code. Each can only ever be used once. */
function checkSecondFactor(user, rawCode) {
  const text = String(rawCode ?? '').trim();

  if (/^\d{3}\s?\d{3}$/.test(text)) {
    if (!user.totp_secret) return { ok: false };
    let secret;
    try {
      secret = decrypt(user.totp_secret);
    } catch {
      console.error(`[2fa] could not decrypt the two-factor secret of user ${user.id} - was APP_SECRET changed?`);
      return { ok: false };
    }
    const step = verifyTotp(secret, text, { lastStep: user.totp_last_step });
    if (!step) return { ok: false };
    // The WHERE clause makes this atomic: two parallel requests can't both spend the same code.
    const spent = db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?').run(step, user.id, step);
    return spent.changes === 1 ? { ok: true, method: 'authenticator' } : { ok: false };
  }

  const row = db
    .prepare('SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
    .get(user.id, hashRecoveryCode(text));
  if (!row) return { ok: false };
  const spent = db.prepare("UPDATE recovery_codes SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL").run(row.id);
  return spent.changes === 1 ? { ok: true, method: 'recovery code' } : { ok: false };
}

// Short-lived "password was right, now prove the second factor" tickets (memory only: a restart just asks again).
const challenges = new Map();
const CHALLENGE_MS = 5 * 60_000;
const MAX_CODE_TRIES = 5;

function newChallenge(userId) {
  const now = Date.now();
  for (const [key, c] of challenges) if (c.expires < now) challenges.delete(key);
  if (challenges.size > 5000) challenges.clear();
  const token = randomToken(24);
  challenges.set(token, { userId, expires: now + CHALLENGE_MS, tries: 0 });
  return token;
}

const recoveryCodesLeft = (userId) =>
  db.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL').get(userId).n;

// ---- sign in / out ---------------------------------------------------------------------------

router.post('/login', loginIpLimiter, loginAccountLimiter, loginEmailCeiling, async (req, res) => {
  const { email, password } = z
    .object({
      email: z.string().trim().min(1, 'Email is required').max(200),
      password: z.string().min(1, 'Password is required').max(200),
    })
    .parse(req.body);

  const user = getUserByEmail.get(email);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || !user.is_active) {
    audit(req, 'auth.login_failed', email.toLowerCase(), user && ok && !user.is_active ? 'account disabled' : null, { email: email.toLowerCase() });
    throw new HttpError(401, 'Invalid email or password');
  }

  if (user.totp_enabled) {
    return res.json({ twoFactorRequired: true, challenge: newChallenge(user.id) });
  }

  startSession(req, res, user.id);
  audit(req, 'auth.login', user.email, null, user);
  res.json({ user: serializeUser(user) });
});

router.post('/2fa/verify', twoFactorLimiter, (req, res) => {
  const { challenge, code } = z
    .object({ challenge: z.string().min(10).max(100), code: z.string().min(1).max(40) })
    .parse(req.body);

  const c = challenges.get(challenge);
  if (!c || c.expires < Date.now()) {
    challenges.delete(challenge);
    throw new HttpError(401, 'That sign-in attempt expired. Please enter your password again.');
  }
  const user = getUserById.get(c.userId);
  if (!user || !user.is_active) {
    challenges.delete(challenge);
    throw new HttpError(401, 'Invalid email or password');
  }

  if (++c.tries > MAX_CODE_TRIES) {
    challenges.delete(challenge);
    audit(req, 'auth.2fa_failed', user.email, 'too many wrong codes', user);
    throw new HttpError(401, 'Too many incorrect codes. Please enter your password again.');
  }

  const result = checkSecondFactor(user, code);
  if (!result.ok) {
    audit(req, 'auth.2fa_failed', user.email, null, user);
    throw new HttpError(401, 'That code is not correct');
  }

  challenges.delete(challenge);
  startSession(req, res, user.id);
  audit(req, 'auth.login', user.email, `second factor: ${result.method}`, user);
  res.json({ user: serializeUser(getUserById.get(user.id)) });
});

router.post('/logout', (req, res) => {
  endCurrentSession(req, res);
  res.json({ ok: true });
});

router.get('/me', requireAuthForSetup, (req, res) => {
  const body = { user: serializeUser(req.user) };
  if (req.user.totp_enabled) body.recoveryCodesLeft = recoveryCodesLeft(req.user.id);
  res.json(body);
});

// ---- password --------------------------------------------------------------------------------

router.put('/password', requireAuthForSetup, sensitiveLimiter, async (req, res) => {
  const { currentPassword, newPassword } = z
    .object({ currentPassword: z.string().min(1, 'Enter your current password').max(200), newPassword: passwordSchema })
    .parse(req.body);

  if (!(await bcrypt.compare(currentPassword, req.user.password_hash))) {
    throw new HttpError(400, 'Your current password is incorrect');
  }
  if (newPassword === currentPassword) throw new HttpError(400, 'Choose a password you have not used just now');
  assertStrongPassword(newPassword, { email: req.user.email, name: req.user.name });

  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = datetime('now') WHERE id = ?",
  ).run(hash, req.user.id);
  endUserSessions(req.user.id, req.sessionId); // every other device is signed out
  audit(req, 'auth.password_changed', req.user.email);
  res.json({ user: serializeUser(getUserById.get(req.user.id)) });
});

// ---- two-factor enrolment --------------------------------------------------------------------

async function requirePassword(user, password) {
  if (typeof password !== 'string' || !(await bcrypt.compare(password.slice(0, 200), user.password_hash))) {
    throw new HttpError(400, 'Your password is incorrect');
  }
}

// Step 1: after re-entering the password, get a fresh secret + QR code to scan.
router.post('/2fa/setup', requireAuthForSetup, sensitiveLimiter, async (req, res) => {
  const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body);
  if (req.user.totp_enabled) throw new HttpError(400, 'Two-factor authentication is already on');
  await requirePassword(req.user, password);

  const secret = newTotpSecret();
  db.prepare('UPDATE users SET totp_secret = ?, totp_last_step = 0 WHERE id = ?').run(encrypt(secret), req.user.id);
  const uri = otpauthUri({ secret, account: req.user.email, issuer: 'LinkHub' });
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
  res.json({ secret, uri, qr });
});

// Step 2: prove the app works by entering a code. Only then is it switched on, and recovery codes are shown (once).
router.post('/2fa/enable', requireAuthForSetup, sensitiveLimiter, (req, res) => {
  const { code } = z.object({ code: z.string().min(1).max(20) }).parse(req.body);
  const user = getUserById.get(req.user.id);
  if (user.totp_enabled) throw new HttpError(400, 'Two-factor authentication is already on');
  if (!user.totp_secret) throw new HttpError(400, 'Start the setup again');

  const step = verifyTotp(decrypt(user.totp_secret), code, { lastStep: 0 });
  if (!step) throw new HttpError(400, 'That code is not correct. Check the time on your phone and try the next code.');

  const codes = newRecoveryCodes(10);
  db.transaction(() => {
    db.prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?').run(step, user.id);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
    const ins = db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)');
    for (const c of codes) ins.run(user.id, hashRecoveryCode(c));
  })();
  endUserSessions(user.id, req.sessionId);
  audit(req, 'auth.2fa_enabled', user.email);
  res.json({ user: serializeUser(getUserById.get(user.id)), recoveryCodes: codes });
});

router.post('/2fa/disable', requireAuthForSetup, sensitiveLimiter, async (req, res) => {
  const { password, code } = z.object({ password: z.string().min(1).max(200), code: z.string().min(1).max(40) }).parse(req.body);
  const user = getUserById.get(req.user.id);
  if (!user.totp_enabled) throw new HttpError(400, 'Two-factor authentication is not on');
  if (config.require2faAdmins && user.role === 'admin') {
    throw new HttpError(400, 'Two-factor authentication is required for administrators and cannot be turned off');
  }
  await requirePassword(user, password);
  if (!checkSecondFactor(user, code).ok) throw new HttpError(400, 'That code is not correct');

  db.transaction(() => {
    db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = 0 WHERE id = ?').run(user.id);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
  })();
  audit(req, 'auth.2fa_disabled', user.email);
  res.json({ user: serializeUser(getUserById.get(user.id)) });
});

// ---- active sessions -------------------------------------------------------------------------

router.get('/sessions', requireAuthForSetup, (req, res) => {
  res.json({ sessions: listSessions(req.user.id, req.sessionId) });
});

router.delete('/sessions/others', requireAuthForSetup, (req, res) => {
  endUserSessions(req.user.id, req.sessionId);
  audit(req, 'auth.sessions_revoked', req.user.email);
  res.json({ ok: true });
});

export default router;
