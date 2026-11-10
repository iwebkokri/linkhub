import { config } from './config.js';
import { db } from './db.js';
import { keyedHash } from './secrets.js';

// ---- days ------------------------------------------------------------------

const dayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: config.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 'YYYY-MM-DD' for the given moment, in STATS_TIMEZONE. */
export function dayOf(date = new Date()) {
  const p = Object.fromEntries(dayFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Pure calendar arithmetic on 'YYYY-MM-DD' strings (no time zones involved). */
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every day in the last `days` days, oldest first, ending today. */
export function dayRange(days) {
  const today = dayOf();
  return Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));
}

// ---- classifying a request -------------------------------------------------

const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|go-http-client|axios/i;

export function isBot(ua) {
  return !ua || BOT_RE.test(ua);
}

export function deviceOf(ua) {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** Anonymous, per-day visitor id. Not reversible, and it changes every day, so it can't track anyone over time. */
function visitorId(req, day) {
  const ua = req.get('user-agent') || '';
  return keyedHash('visitor', `${day}|${req.ip}|${ua}`).slice(0, 16);
}

// Repeats from the same visitor inside a short window are ignored (page-reload spam, double taps,
// scripted inflation). The map is capped so it can't be used to exhaust memory.
const recent = new Map();
const MAX_RECENT = 50_000;

function isRepeat(key, windowSeconds) {
  if (!windowSeconds) return false;
  const now = Date.now();
  const last = recent.get(key);
  if (last !== undefined && now - last < windowSeconds * 1000) return true;
  if (recent.size >= MAX_RECENT) recent.clear();
  recent.set(key, now);
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - Math.max(config.viewDedupeSeconds, config.clickDedupeSeconds, 1) * 1000;
  for (const [key, at] of recent) if (at < cutoff) recent.delete(key);
}, 60_000).unref();

function cleanSource({ referrer, utm }, ownHost) {
  if (utm) return utm.toLowerCase().replace(/[^a-z0-9._ -]/g, '').slice(0, 50);
  if (!referrer) return '';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase();
    return host === String(ownHost).replace(/^www\./, '').toLowerCase() ? '' : host.slice(0, 100);
  } catch {
    return '';
  }
}

// ---- recording -------------------------------------------------------------

const insertView = db.prepare(
  'INSERT INTO page_views (business_id, day, visitor, source, device) VALUES (?, ?, ?, ?, ?)',
);
const bumpViews = db.prepare('UPDATE businesses SET views = views + 1 WHERE id = ?');
const insertClick = db.prepare(
  'INSERT INTO link_clicks (link_id, business_id, day, visitor, device) VALUES (?, ?, ?, ?, ?)',
);
const bumpClicks = db.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?');

export function recordView(businessId, req, { referrer, utm } = {}) {
  const ua = req.get('user-agent') || '';
  if (isBot(ua)) return;
  const day = dayOf();
  const visitor = visitorId(req, day);
  if (isRepeat(`v:${businessId}:${visitor}`, config.viewDedupeSeconds)) return;
  db.transaction(() => {
    insertView.run(businessId, day, visitor, cleanSource({ referrer, utm }, req.hostname), deviceOf(ua));
    bumpViews.run(businessId);
  })();
}

export function recordClick(link, req) {
  const ua = req.get('user-agent') || '';
  if (isBot(ua)) return;
  const day = dayOf();
  const visitor = visitorId(req, day);
  if (isRepeat(`c:${link.id}:${visitor}`, config.clickDedupeSeconds)) return;
  db.transaction(() => {
    insertClick.run(link.id, link.business_id, day, visitor, deviceOf(ua));
    bumpClicks.run(link.id);
  })();
}

/** Delete events older than STATS_RETENTION_DAYS (the all-time counters on businesses/links are kept). */
export function pruneStats(retentionDays = config.statsRetentionDays) {
  if (!retentionDays) return;
  const cutoff = addDays(dayOf(), -retentionDays);
  db.prepare('DELETE FROM page_views WHERE day < ?').run(cutoff);
  db.prepare('DELETE FROM link_clicks WHERE day < ?').run(cutoff);
}

// ---- reporting -------------------------------------------------------------

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

function sum(arr, key) {
  return arr.reduce((t, x) => t + x[key], 0);
}

/** Full report for one business. `visitors` is the sum of each day's unique visitors. */
export function businessReport(businessId, days) {
  const dates = dayRange(days);
  const since = dates[0];

  const viewRows = db
    .prepare(
      `SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
         FROM page_views WHERE business_id = ? AND day >= ? GROUP BY day`,
    )
    .all(businessId, since);
  const clickRows = db
    .prepare('SELECT day, COUNT(*) AS clicks FROM link_clicks WHERE business_id = ? AND day >= ? GROUP BY day')
    .all(businessId, since);

  const viewsBy = new Map(viewRows.map((r) => [r.day, r]));
  const clicksBy = new Map(clickRows.map((r) => [r.day, r.clicks]));
  const daily = dates.map((date) => ({
    date,
    views: viewsBy.get(date)?.views ?? 0,
    visitors: viewsBy.get(date)?.visitors ?? 0,
    clicks: clicksBy.get(date) ?? 0,
  }));

  const totals = {
    views: sum(daily, 'views'),
    visitors: sum(daily, 'visitors'),
    clicks: sum(daily, 'clicks'),
  };
  totals.clickRate = pct(totals.clicks, totals.views);

  // Per-link: range total, all-time total and a daily series for a sparkline.
  const links = db
    .prepare(
      `SELECT l.id, l.title, l.platform, l.url, l.display, l.is_active AS isActive, l.clicks AS allTime,
              (SELECT COUNT(*) FROM link_clicks c WHERE c.link_id = l.id AND c.day >= ?) AS clicks
         FROM links l WHERE l.business_id = ? ORDER BY clicks DESC, l.position, l.id`,
    )
    .all(since, businessId);
  const seriesRows = db
    .prepare(
      'SELECT link_id, day, COUNT(*) AS n FROM link_clicks WHERE business_id = ? AND day >= ? GROUP BY link_id, day',
    )
    .all(businessId, since);
  const series = new Map();
  for (const r of seriesRows) {
    if (!series.has(r.link_id)) series.set(r.link_id, new Map());
    series.get(r.link_id).set(r.day, r.n);
  }
  const linkReport = links.map((l) => ({
    ...l,
    isActive: !!l.isActive,
    share: pct(l.clicks, totals.clicks),
    series: dates.map((d) => series.get(l.id)?.get(d) ?? 0),
  }));

  const sources = db
    .prepare(
      `SELECT CASE WHEN source = '' THEN 'Direct / unknown' ELSE source END AS name, COUNT(*) AS views
         FROM page_views WHERE business_id = ? AND day >= ? GROUP BY 1 ORDER BY views DESC LIMIT 10`,
    )
    .all(businessId, since);
  const devices = db
    .prepare(
      'SELECT device AS name, COUNT(*) AS views FROM page_views WHERE business_id = ? AND day >= ? GROUP BY device ORDER BY views DESC',
    )
    .all(businessId, since);

  return { days, since, timezone: config.timezone, totals, daily, links: linkReport, sources, devices };
}

/** Roll-up across several businesses (the ones the user may see). */
export function overviewReport(businessIds, days) {
  const dates = dayRange(days);
  const since = dates[0];
  const empty = { days, since, timezone: config.timezone, totals: { views: 0, visitors: 0, clicks: 0 }, daily: dates.map((date) => ({ date, views: 0, visitors: 0, clicks: 0 })), businesses: [] };
  if (!businessIds.length) return empty;

  const marks = businessIds.map(() => '?').join(',');
  const viewRows = db
    .prepare(
      `SELECT day, COUNT(*) AS views FROM page_views WHERE business_id IN (${marks}) AND day >= ? GROUP BY day`,
    )
    .all(...businessIds, since);
  const visitorRows = db
    .prepare(
      `SELECT day, COUNT(DISTINCT business_id || ':' || visitor) AS visitors
         FROM page_views WHERE business_id IN (${marks}) AND day >= ? GROUP BY day`,
    )
    .all(...businessIds, since);
  const clickRows = db
    .prepare(`SELECT day, COUNT(*) AS clicks FROM link_clicks WHERE business_id IN (${marks}) AND day >= ? GROUP BY day`)
    .all(...businessIds, since);

  const v = new Map(viewRows.map((r) => [r.day, r.views]));
  const u = new Map(visitorRows.map((r) => [r.day, r.visitors]));
  const c = new Map(clickRows.map((r) => [r.day, r.clicks]));
  const daily = dates.map((date) => ({ date, views: v.get(date) ?? 0, visitors: u.get(date) ?? 0, clicks: c.get(date) ?? 0 }));

  const perBusiness = db
    .prepare(
      `SELECT b.id,
              (SELECT COUNT(*) FROM page_views p WHERE p.business_id = b.id AND p.day >= ?) AS views,
              (SELECT COUNT(DISTINCT p.visitor) FROM page_views p WHERE p.business_id = b.id AND p.day >= ?) AS visitors,
              (SELECT COUNT(*) FROM link_clicks k WHERE k.business_id = b.id AND k.day >= ?) AS clicks
         FROM businesses b WHERE b.id IN (${marks})`,
    )
    .all(since, since, since, ...businessIds);

  return {
    days,
    since,
    timezone: config.timezone,
    totals: { views: sum(daily, 'views'), visitors: sum(daily, 'visitors'), clicks: sum(daily, 'clicks') },
    daily,
    businesses: perBusiness,
  };
}
