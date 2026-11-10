import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';

const flag = (v, fallback) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const whole = (v, fallback) => (Number.isInteger(Number(v)) && v !== undefined && v !== '' && Number(v) >= 0 ? Number(v) : fallback);
const list = (v) => String(v || '').split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

function fatal(message) {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

// ---- the application secret ------------------------------------------------------------------
// Used to encrypt two-factor secrets at rest and to make the anonymous daily visitor hashes.
// (Login sessions are random tokens stored in the database - they don't depend on this value.)
let secret = process.env.APP_SECRET || process.env.JWT_SECRET; // JWT_SECRET is the old name, still accepted
const looksLikePlaceholder = secret && /^(change|secret|your|example|xxx|generate|password)/i.test(secret);
if (!secret || secret.length < 32 || looksLikePlaceholder) {
  if (isProd) {
    console.error('FATAL: APP_SECRET must be set to a long random value (at least 32 characters) in production.');
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  }
  // Development only: a fixed value keeps you signed in and 2FA working across restarts.
  secret = crypto.createHash('sha256').update('linkhub-dev-secret').digest('hex');
  console.warn('[config] APP_SECRET not set - using an insecure development secret.');
}

// ---- warn when the .env file can be read by other users on the machine ------------------------
try {
  const envFile = path.resolve(process.cwd(), '.env');
  if (process.platform !== 'win32' && fs.existsSync(envFile) && (fs.statSync(envFile).mode & 0o077) !== 0) {
    console.warn(`[security] ${envFile} is readable by other users. Run: chmod 600 ${envFile}`);
  }
} catch {
  /* best effort */
}

function parseTrustProxy(v) {
  if (v === undefined || v === '') return false;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v; // e.g. "loopback" or a CIDR list
}

// Time zone used to decide which "day" a visit / click belongs to in the statistics.
function resolveTimezone() {
  const wanted = process.env.STATS_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: wanted });
    return wanted;
  } catch {
    console.warn(`[config] Unknown STATS_TIMEZONE "${wanted}" - falling back to UTC.`);
    return 'UTC';
  }
}

const dataDir = path.resolve(serverRoot, process.env.DATA_DIR || 'data');
const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

let publicHost = '';
if (publicUrl) {
  try {
    publicHost = new URL(publicUrl).hostname.toLowerCase();
  } catch {
    fatal(`PUBLIC_URL "${publicUrl}" is not a valid URL (example: https://links.yourdomain.com).`);
  }
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 4000,
  // In production listen on the loopback interface only: Nginx is the public door.
  // (Docker sets HOST=0.0.0.0 inside the container.) Leave unset in development.
  host: process.env.HOST || (isProd ? '127.0.0.1' : undefined),
  dataDir,
  uploadDir: path.join(dataDir, 'uploads'),
  clientDist: path.resolve(serverRoot, '../client/dist'),
  publicUrl,
  // When PUBLIC_URL is set in production, requests for any other Host name are refused.
  allowedHosts: [...new Set([publicHost, ...list(process.env.ALLOWED_HOSTS)].filter(Boolean))],
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // 'auto' = mark the cookie Secure only when the request arrived over HTTPS.
  cookieSecure: (process.env.COOKIE_SECURE || 'auto').toLowerCase(),
  secret,
  timezone: resolveTimezone(),
  // Extra hosts allowed by the Content-Security-Policy (script/connect/img), e.g. tags you load through Tag Manager.
  cspExtraSources: (process.env.CSP_EXTRA_SOURCES || '').split(/[\s,]+/).filter(Boolean),

  // ---- sessions ----
  sessionMaxMs: whole(process.env.SESSION_MAX_HOURS, 12) * 60 * 60 * 1000, // hard limit
  sessionIdleMs: whole(process.env.SESSION_IDLE_MINUTES, 120) * 60 * 1000, // signed out after this much inactivity

  // ---- accounts ----
  // Administrators must set up an authenticator app before they can do anything. On by default in production.
  require2faAdmins: flag(process.env.REQUIRE_2FA_FOR_ADMINS, isProd),
  admin: {
    name: process.env.ADMIN_NAME || 'Administrator',
    email: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || '',
  },

  // Extra words that may not appear in short passwords, e.g. your company or product name.
  weakPasswordWords: list(process.env.WEAK_PASSWORD_WORDS),

  // ---- link safety (anti-phishing) ----
  blockedLinkDomains: list(process.env.BLOCKED_LINK_DOMAINS),
  allowPunycodeLinks: flag(process.env.ALLOW_PUNYCODE_LINKS, false),
  maxLinksPerBusiness: whole(process.env.MAX_LINKS_PER_BUSINESS, 100),

  // ---- abuse limits & data retention ----
  viewDedupeSeconds: whole(process.env.STATS_VIEW_DEDUPE_SECONDS, 30),
  clickDedupeSeconds: whole(process.env.STATS_CLICK_DEDUPE_SECONDS, 2),
  statsRetentionDays: whole(process.env.STATS_RETENTION_DAYS, 730), // 0 = keep forever
  auditRetentionDays: whole(process.env.AUDIT_RETENTION_DAYS, 730), // 0 = keep forever
};
