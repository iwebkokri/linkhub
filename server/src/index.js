import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { config } from './config.js';
import { db } from './db.js';
import { ensureAdmin } from './bootstrap.js';
import { purgeSessions } from './auth.js';
import { pruneAudit } from './audit.js';
import { initGeo } from './geo.js';
import { apiLimiter, pageLimiter } from './limits.js';
import { extraHeaders, hostGuard, originGuard } from './security.js';
import { pruneStats } from './stats.js';
import { HttpError, RESERVED_SLUGS } from './util.js';
import { MAX_UPLOAD_MB } from './uploads.js';
import authRouter from './routes/auth.js';
import businessesRouter from './routes/businesses.js';
import linksRouter from './routes/links.js';
import usersRouter from './routes/users.js';
import publicRouter from './routes/public.js';
import analyticsRouter from './routes/analytics.js';
import settingsRouter from './routes/settings.js';
import auditRouter from './routes/audit.js';

await ensureAdmin();
const geo = await initGeo();

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// First line of defence: only answer to our own host name(s) (production + PUBLIC_URL).
app.use(hostGuard);

// Hosts the supported tracking products (Google Analytics / Tag Manager, Meta Pixel, TikTok Pixel) talk to.
const GOOGLE = [
  'https://www.googletagmanager.com', 'https://*.googletagmanager.com',
  'https://www.google-analytics.com', 'https://*.google-analytics.com',
  'https://*.analytics.google.com', 'https://www.google.com',
  'https://stats.g.doubleclick.net', 'https://*.g.doubleclick.net',
];
const META = ['https://connect.facebook.net', 'https://www.facebook.com'];
const TIKTOK = ['https://analytics.tiktok.com', 'https://analytics-ipv6.tiktokw.com'];
const extra = config.cspExtraSources;

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true, // default-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; script-src-attr 'none'
      directives: {
        // Don't force https: the app may be reached over plain http (e.g. by IP) before TLS is set up.
        'upgrade-insecure-requests': null,
        'script-src': ["'self'", 'https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://analytics.tiktok.com', ...extra],
        'connect-src': ["'self'", ...GOOGLE, ...META, ...TIKTOK, ...extra],
        'img-src': ["'self'", 'data:', ...GOOGLE, ...META, ...TIKTOK, ...extra],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // lets WhatsApp / Facebook fetch the logo for link previews
    // Destination sites see "https://your-domain" (not the full path) when a visitor taps a link.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true }, // browsers only honour this over HTTPS
  }),
);
app.use(extraHeaders);
app.use(compression());
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/robots.txt', (_req, res) => {
  res.type('text').send('User-agent: *\nDisallow: /admin\nDisallow: /api/\n');
});

// ---- API -------------------------------------------------------------------
app.use('/api', originGuard, apiLimiter);
app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/api/businesses', businessesRouter);
app.use('/api/users', usersRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/audit', auditRouter);
app.use('/api', linksRouter);
app.use('/api', analyticsRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Uploaded logos / covers. File names are random, so they can be cached for a long time.
// The sandboxed CSP means that even if something other than an image ever got in here, it could not run.
app.use(
  '/uploads',
  express.static(config.uploadDir, {
    maxAge: '30d',
    immutable: true,
    index: false,
    dotfiles: 'deny',
    fallthrough: false,
    setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; sandbox"),
  }),
);

// ---- React app (production build) ------------------------------------------
const indexFile = path.join(config.clientDist, 'index.html');
const template = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : null;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const findPublicBusiness = db.prepare(
  'SELECT name, slug, tagline, bio, logo_url FROM businesses WHERE slug = ? AND is_active = 1',
);

/** Social crawlers (WhatsApp, Facebook, X, iMessage...) don't run JavaScript, so the
 *  title / description / image for a business page are written into the HTML here. */
function renderIndex(req, business) {
  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  const title = esc(business.name);
  const description = esc((business.tagline || business.bio || `Find ${business.name} online`).slice(0, 200));
  const url = esc(`${base}/${business.slug}`);
  const image = business.logo_url ? esc(`${base}${business.logo_url}`) : '';
  const tags = [
    `<meta name="description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    image && `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    image && `<meta name="twitter:image" content="${image}" />`,
  ]
    .filter(Boolean)
    .join('\n    ');
  return template
    .replace('<!--__META__-->', tags)
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
}

if (template) {
  app.use(pageLimiter);
  app.use('/assets', express.static(path.join(config.clientDist, 'assets'), { maxAge: '1y', immutable: true, fallthrough: false }));
  app.use(express.static(config.clientDist, { index: false, dotfiles: 'deny' }));

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.set('Cache-Control', 'no-cache');

    const m = req.path.match(/^\/([^/]+)\/?$/);
    let slug = null;
    try {
      slug = m && decodeURIComponent(m[1]).toLowerCase();
    } catch {
      /* malformed % escape: treat as unknown page */
    }
    if (slug && !RESERVED_SLUGS.has(slug)) {
      const business = findPublicBusiness.get(slug);
      if (business) return res.type('html').send(renderIndex(req, business));
      return res.status(404).type('html').send(template); // React shows the "page not found" screen
    }
    res.type('html').send(template);
  });
} else {
  app.get('/', (_req, res) => {
    res.type('text').send('LinkHub API is running. Build the client (npm run build) or run it with "npm run dev".');
  });
}

// ---- errors ----------------------------------------------------------------
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return res.status(400).json({ error: issues[0]?.message || 'Invalid input', details: issues });
  }
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `Image is too large (max ${MAX_UPLOAD_MB} MB)` : 'Upload failed';
    return res.status(400).json({ error: msg });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
  if (err?.status === 404) return res.status(404).json({ error: 'Not found' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`LinkHub listening on http://${config.host ?? 'localhost'}:${config.port} (${config.isProd ? 'production' : 'development'})`);
  if (config.isProd && !config.allowedHosts.length) {
    console.warn('[security] PUBLIC_URL is not set: any Host name is accepted and share-preview links use the request host. Set PUBLIC_URL.');
  }
  console.log(geo.loaded ? `[geo] visitor location: ${geo.provider} database loaded (${geo.sizeMB} MB)` : '[geo] visitor location: no database installed - run "npm run geoip:update" to enable it');
  if (config.isProd && !config.require2faAdmins) {
    console.warn('[security] Two-factor authentication is not required for administrators (REQUIRE_2FA_FOR_ADMINS=false).');
  }
});

// Slow-connection (Slowloris) protection: drop clients that dribble headers or bodies.
server.headersTimeout = 20_000;
server.requestTimeout = 60_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 1000;

// ---- housekeeping ------------------------------------------------------------
function housekeeping() {
  try {
    purgeSessions();
    pruneStats();
    pruneAudit(config.auditRetentionDays);
  } catch (err) {
    console.error('[housekeeping]', err.message);
  }
}
housekeeping();
setInterval(housekeeping, 60 * 60 * 1000).unref();

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
