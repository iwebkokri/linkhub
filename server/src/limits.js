import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// These are application-level backstops. They stop one client from hammering the app and slow
// down password guessing, but they cannot absorb a large distributed flood - that has to be
// stopped before it reaches the server (Nginx limits, a CDN such as Cloudflare). See SECURITY.md.
//
// Numbers are deliberately generous per IP: a conference-centre Wi-Fi or a mobile carrier can put
// hundreds of real visitors behind one address.

const base = { standardHeaders: 'draft-7', legacyHeaders: false };
const tooMany = (error) => ({ error });

const emailOf = (req) => String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200);

/** Every /api request, per IP. */
export const apiLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 600,
  message: tooMany('Too many requests. Please slow down and try again shortly.'),
});

/** Page-view and link-click beacons from the public pages, per IP. */
export const counterLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 300,
  message: tooMany('Too many requests'),
});

/** HTML + static files, per IP (a cheap flood shield; Nginx should do the heavy lifting). */
export const pageLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 1200,
  message: 'Too many requests. Please slow down and try again shortly.',
});

// --- sign-in: only FAILED attempts count, so normal use is never throttled -----------------------
const failedOnly = { skipSuccessfulRequests: true };

/** Same IP, any account. */
export const loginIpLimiter = rateLimit({
  ...base,
  ...failedOnly,
  windowMs: 15 * 60_000,
  limit: 10,
  message: tooMany('Too many failed sign-in attempts. Try again in 15 minutes.'),
});

/** Same account from the same IP: the person guessing a specific password. */
export const loginAccountLimiter = rateLimit({
  ...base,
  ...failedOnly,
  windowMs: 15 * 60_000,
  limit: 5,
  keyGenerator: (req) => `${emailOf(req)}|${ipKeyGenerator(req.ip)}`,
  message: tooMany('Too many failed sign-in attempts for this account. Try again in 15 minutes.'),
});

/** Same account from anywhere: bounds a slow, distributed guessing campaign. */
export const loginEmailCeiling = rateLimit({
  ...base,
  ...failedOnly,
  windowMs: 60 * 60_000,
  limit: 30,
  keyGenerator: (req) => emailOf(req) || ipKeyGenerator(req.ip),
  message: tooMany('Too many failed sign-in attempts for this account. Try again later.'),
});

/** Guessing 6-digit codes / recovery codes. */
export const twoFactorLimiter = rateLimit({
  ...base,
  ...failedOnly,
  windowMs: 15 * 60_000,
  limit: 10,
  message: tooMany('Too many incorrect codes. Try again in 15 minutes.'),
});

/** Password change / 2FA enrolment, per signed-in user. */
export const sensitiveLimiter = rateLimit({
  ...base,
  ...failedOnly,
  windowMs: 15 * 60_000,
  limit: 10,
  keyGenerator: (req) => `user:${req.user?.id ?? ipKeyGenerator(req.ip)}`,
  message: tooMany('Too many attempts. Try again in 15 minutes.'),
});
