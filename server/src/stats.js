import { config } from './config.js';
import { db } from './db.js';
import { countryName, geoStatus, getPrecision, locate } from './geo.js';
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
  'INSERT INTO page_views (business_id, day, visitor, source, device, country, region, city) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
const bumpViews = db.prepare('UPDATE businesses SET views = views + 1 WHERE id = ?');
const insertClick = db.prepare(
  'INSERT INTO link_clicks (link_id, business_id, day, visitor, device, country, region, city) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
const bumpClicks = db.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?');

export function recordView(businessId, req, { referrer, utm } = {}) {
  const ua = req.get('user-agent') || '';
  if (isBot(ua)) return;
  const day = dayOf();
  const visitor = visitorId(req, day);
  if (isRepeat(`v:${businessId}:${visitor}`, config.viewDedupeSeconds)) return;
  const geo = locate(req); // the IP is used for this lookup only and is never stored
  db.transaction(() => {
    insertView.run(businessId, day, visitor, cleanSource({ referrer, utm }, req.hostname), deviceOf(ua), geo.country, geo.region, geo.city);
    bumpViews.run(businessId);
  })();
}

export function recordClick(link, req) {
  const ua = req.get('user-agent') || '';
  if (isBot(ua)) return;
  const day = dayOf();
  const visitor = visitorId(req, day);
  if (isRepeat(`c:${link.id}:${visitor}`, config.clickDedupeSeconds)) return;
  const geo = locate(req);
  db.transaction(() => {
    insertClick.run(link.id, link.business_id, day, visitor, deviceOf(ua), geo.country, geo.region, geo.city);
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

/**
 * Where visits and clicks came from. `scope` is a SQL fragment over business_id (one business, or several).
 * Countries and cities each list views and clicks side by side; `located` says how much of the traffic could be placed.
 */
function locationReport(scopeSql, scopeArgs, since) {
  const q = (sql, ...args) => db.prepare(sql).all(...scopeArgs, since, ...args);

  const merge = (viewRows, clickRows, keyOf, make) => {
    const map = new Map();
    for (const r of viewRows) map.set(keyOf(r), { ...make(r), views: r.n, clicks: 0 });
    for (const r of clickRows) {
      const k = keyOf(r);
      const e = map.get(k) ?? { ...make(r), views: 0, clicks: 0 };
      e.clicks = r.n;
      map.set(k, e);
    }
    return [...map.values()].sort((a, b) => b.views + b.clicks - (a.views + a.clicks) || b.views - a.views).slice(0, 12);
  };

  const countries = merge(
    q(`SELECT country, COUNT(*) AS n FROM page_views  WHERE ${scopeSql} AND day >= ? AND country != '' GROUP BY country`),
    q(`SELECT country, COUNT(*) AS n FROM link_clicks WHERE ${scopeSql} AND day >= ? AND country != '' GROUP BY country`),
    (r) => r.country,
    (r) => ({ code: r.country, name: countryName(r.country) }),
  );
  const cities = merge(
    q(`SELECT city, region, country, COUNT(*) AS n FROM page_views  WHERE ${scopeSql} AND day >= ? AND city != '' GROUP BY city, region, country`),
    q(`SELECT city, region, country, COUNT(*) AS n FROM link_clicks WHERE ${scopeSql} AND day >= ? AND city != '' GROUP BY city, region, country`),
    (r) => `${r.city}|${r.region}|${r.country}`,
    (r) => ({ city: r.city, region: r.region, code: r.country, country: countryName(r.country) }),
  );

  const cover = (table) => {
    const r = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(country != ''), 0) AS located FROM ${table} WHERE ${scopeSql} AND day >= ?`).get(...scopeArgs, since);
    return { total: r.total, located: r.located };
  };
  const status = geoStatus();
  return {
    precision: getPrecision(), // 'off' | 'country' | 'region' | 'city' - what is being recorded NOW
    databaseLoaded: status.loaded,
    provider: status.provider,
    countries,
    cities,
    located: { views: cover('page_views'), clicks: cover('link_clicks') },
  };
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
  // each link's strongest location (by clicks in this range)
  const topByLink = new Map();
  for (const r of db
    .prepare(
      "SELECT link_id, country, COUNT(*) AS n FROM link_clicks WHERE business_id = ? AND day >= ? AND country != '' GROUP BY link_id, country",
    )
    .all(businessId, since)) {
    const cur = topByLink.get(r.link_id);
    if (!cur || r.n > cur.clicks) topByLink.set(r.link_id, { code: r.country, name: countryName(r.country), clicks: r.n });
  }
  const linkReport = links.map((l) => ({
    ...l,
    isActive: !!l.isActive,
    share: pct(l.clicks, totals.clicks),
    series: dates.map((d) => series.get(l.id)?.get(d) ?? 0),
    topLocation: topByLink.get(l.id) ?? null,
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

  // the latest clicks: anonymous (no IP, no identity) - just when, on which link, from roughly where, on what device
  const recentClicks = db
    .prepare(
      `SELECT c.id, c.ts, c.country, c.region, c.city, c.device, l.title, l.platform
         FROM link_clicks c JOIN links l ON l.id = c.link_id
        WHERE c.business_id = ? ORDER BY c.id DESC LIMIT 25`,
    )
    .all(businessId)
    .map((r) => ({
      id: r.id,
      time: `${r.ts.replace(' ', 'T')}Z`, // stored in UTC
      title: r.title,
      platform: r.platform,
      device: r.device,
      country: r.country,
      countryName: countryName(r.country),
      region: r.region,
      city: r.city,
    }));

  return {
    days,
    since,
    timezone: config.timezone,
    totals,
    daily,
    links: linkReport,
    sources,
    devices,
    locations: locationReport('business_id = ?', [businessId], since),
    recentClicks,
  };
}

/** Roll-up across several businesses (the ones the user may see). */
export function overviewReport(businessIds, days) {
  const dates = dayRange(days);
  const since = dates[0];
  const empty = { days, since, timezone: config.timezone, totals: { views: 0, visitors: 0, clicks: 0 }, daily: dates.map((date) => ({ date, views: 0, visitors: 0, clicks: 0 })), businesses: [], locations: { precision: getPrecision(), databaseLoaded: geoStatus().loaded, provider: geoStatus().provider, countries: [], cities: [], located: { views: { total: 0, located: 0 }, clicks: { total: 0, located: 0 } } } };
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
    locations: locationReport(`business_id IN (${marks})`, businessIds, since),
  };
}
