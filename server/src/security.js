import { config } from './config.js';

const hostOf = (value) => String(value || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Refuse requests addressed to a host name that isn't ours (production, when PUBLIC_URL is set).
 * Stops host-header attacks (poisoned links / caches) and lets you ignore bare-IP scans.
 * Uses the raw Host header on purpose: X-Forwarded-Host can be forged by a client.
 */
export function hostGuard(req, res, next) {
  if (!config.isProd || !config.allowedHosts.length) return next();
  const host = hostOf(req.headers.host);
  if (LOCAL_HOSTS.has(host) || config.allowedHosts.includes(host)) return next();
  res.status(421).type('text').send('Misdirected request');
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cross-site request forgery defence for the API, on top of SameSite=Strict cookies:
 * a state-changing request must come from this site. Browsers always attach `Origin` to
 * such requests; other clients (curl, scripts) send none and are not CSRF-able anyway.
 */
export function originGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return deny(res);

  const origin = req.get('origin');
  if (origin) {
    let originHost;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      return deny(res); // "null" and other junk
    }
    const own = [String(req.headers.host || '').toLowerCase()];
    if (config.publicUrl) {
      try {
        own.push(new URL(config.publicUrl).host.toLowerCase());
      } catch {
        /* validated at start-up */
      }
    }
    if (!own.includes(originHost)) return deny(res);
  }
  next();
}

function deny(res) {
  res.status(403).json({ error: 'Cross-site request blocked' });
}

/** Headers helmet doesn't set. */
export function extraHeaders(req, res, next) {
  res.set(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
  );
  // Admin screens and the API must never be cached by shared proxies or end up in search results.
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  if (req.path.startsWith('/api') || req.path.startsWith('/admin')) res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
}
