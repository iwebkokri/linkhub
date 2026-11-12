import fs from 'node:fs';
import { open as openMmdb } from 'maxmind';
import { config } from './config.js';
import { db } from './db.js';

// Approximate visitor location. The visitor's IP address is looked up in a local database file (no outside service is
// contacted, so no visitor data leaves this server) and ONLY the resulting country / region / city text is kept.

export const PRECISIONS = ['off', 'country', 'region', 'city'];

let reader = null;
const status = { loaded: false, path: config.geoipDb, sizeMB: null, builtAt: null, provider: null, error: null };

// the library gives the build time as a Date (older versions: seconds since 1970)
export function buildDate(epoch) {
  if (!epoch) return null;
  const d = epoch instanceof Date ? epoch : new Date(Number(epoch) * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function refreshStatus() {
  const stat = fs.statSync(config.geoipDb);
  const type = reader?.metadata?.databaseType || '';
  Object.assign(status, {
    loaded: true,
    sizeMB: Math.round((stat.size / 1048576) * 10) / 10,
    builtAt: buildDate(reader?.metadata?.buildEpoch),
    provider: /dbip/i.test(type) ? 'DB-IP' : /geolite|geoip/i.test(type) ? 'MaxMind' : type || 'unknown',
    error: null,
  });
}

// Not installed yet? Keep an eye out for the file, so that running `npm run geoip:update` for the first time
// switches location on without restarting the server.
let waiting = false;
function waitForInstall() {
  if (waiting) return;
  waiting = true;
  fs.watchFile(config.geoipDb, { interval: 5000, persistent: false }, async (current) => {
    if (reader || current.size === 0) return;
    fs.unwatchFile(config.geoipDb);
    waiting = false;
    await initGeo();
    if (status.loaded) console.log(`[geo] location database found and loaded (${status.provider}, ${status.sizeMB} MB)`);
  });
}

/** Load the database if it is installed. Never fatal: without it, location is simply not recorded. */
export async function initGeo() {
  if (!fs.existsSync(config.geoipDb)) {
    Object.assign(status, { loaded: false, error: 'not installed' });
    waitForInstall();
    return status;
  }
  try {
    reader = await openMmdb(config.geoipDb, {
      cache: { max: 10_000 },
      watchForUpdates: true, // `npm run geoip:update` replaces the file; it is picked up without a restart
      watchForUpdatesNonPersistent: true,
      watchForUpdatesHook: () => {
        try {
          refreshStatus();
          console.log('[geo] location database updated and reloaded');
        } catch {
          /* ignore */
        }
      },
    });
    refreshStatus();
  } catch (err) {
    reader = null;
    Object.assign(status, { loaded: false, error: err.message });
    console.warn(`[geo] could not open ${config.geoipDb}: ${err.message}`);
  }
  return status;
}

export const geoStatus = () => ({ ...status });

// ---- how much detail to keep (an admin setting) ----------------------------------------------------------------------

let cached = { value: 'city', at: 0 };

export function getPrecision() {
  const now = Date.now();
  if (now - cached.at > 15_000) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'location'").get();
    let value = 'city';
    try {
      const p = JSON.parse(row?.value || '{}').precision;
      if (PRECISIONS.includes(p)) value = p;
    } catch {
      /* default */
    }
    cached = { value, at: now };
  }
  return cached.value;
}

export function setPrecision(precision) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('location', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify({ precision }));
  cached = { value: precision, at: Date.now() };
}

// ---- looking a visitor up -------------------------------------------------------------------------------------------

const clean = (s) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 80) : '');
const EMPTY = Object.freeze({ country: '', region: '', city: '' });

/** { country: 'CA', region: 'Ontario', city: 'Toronto' } for this request, limited to the configured detail. '' = unknown. */
export function locate(req) {
  const precision = getPrecision();
  if (precision === 'off') return EMPTY;

  let found = null;

  if (config.trustCloudflareGeo) {
    const cc = String(req.get('cf-ipcountry') || '').toUpperCase();
    if (/^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1') {
      let city = req.get('cf-ipcity') || '';
      try {
        city = decodeURIComponent(city);
      } catch {
        /* keep as is */
      }
      found = { country: cc, region: clean(req.get('cf-region')), city: clean(city) };
    }
  }

  if (!found && reader) {
    const ip = String(req.ip || '').replace(/^::ffff:/i, '');
    try {
      const rec = reader.get(ip);
      if (rec) {
        found = {
          country: clean(rec.country?.iso_code || ''),
          region: clean(rec.subdivisions?.[0]?.names?.en || ''),
          city: clean(rec.city?.names?.en || ''),
        };
      }
    } catch {
      /* not a lookup-able address */
    }
  }

  if (!found || !found.country) return EMPTY;
  if (precision === 'country') return { country: found.country, region: '', city: '' };
  if (precision === 'region') return { country: found.country, region: found.region, city: '' };
  return found;
}

// ---- names for display ---------------------------------------------------------------------------------------------

let regionNames = null;
export function countryName(code) {
  if (!code) return '';
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}
