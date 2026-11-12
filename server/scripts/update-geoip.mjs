// Installs / refreshes the visitor-location database:  npm run geoip:update
//
// Downloads the free "City Lite" database from DB-IP (https://db-ip.com, no account needed, updated monthly), checks it,
// and swaps it in atomically - so a failed download can never leave you without a working database. The running server
// notices the new file by itself (no restart needed). Run it again every month (see deploy/linkhub-geoip.timer).
//
// Prefer MaxMind GeoLite2? Download its City .mmdb yourself and set GEOIP_DB=/path/to/GeoLite2-City.mmdb instead.
//
// Environment (all optional): GEOIP_URL (download a different .mmdb or .mmdb.gz), GEOIP_MIN_MB (sanity check, default 10).
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import { open } from 'maxmind';
import { config } from '../src/config.js';
import { buildDate } from '../src/geo.js';

const dest = config.geoipDb;
const tmp = `${dest}.download`;
const minMB = Number(process.env.GEOIP_MIN_MB ?? 10);

const month = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
function candidates() {
  if (process.env.GEOIP_URL) return [process.env.GEOIP_URL];
  const now = new Date();
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  // the new month's file is published a few days into the month, so fall back to the previous one
  return [month(now), month(last)].map((m) => `https://download.db-ip.com/free/dbip-city-lite-${m}.mmdb.gz`);
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'LinkHub-geoip-updater' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o750 });
  const out = fs.createWriteStream(tmp, { mode: 0o640 });
  const body = Readable.fromWeb(res.body);
  await pipeline(url.endsWith('.gz') ? [body, zlib.createGunzip(), out] : [body, out]);
}

let used = null;
for (const url of candidates()) {
  process.stdout.write(`Downloading ${url} ... `);
  try {
    await download(url);
    console.log('ok');
    used = url;
    break;
  } catch (err) {
    console.log(`failed (${err.message})`);
    fs.rmSync(tmp, { force: true });
  }
}
if (!used) {
  console.error('\nCould not download a location database. Your existing one (if any) was left untouched.');
  process.exit(1);
}

try {
  const sizeMB = fs.statSync(tmp).size / 1048576;
  if (sizeMB < minMB) throw new Error(`the file is only ${sizeMB.toFixed(1)} MB - that is too small for a city database`);
  const reader = await open(tmp);
  const type = reader.metadata.databaseType || '';
  if (!/city/i.test(type)) throw new Error(`this is a "${type}" database, not a City database`);
  const probe = reader.get('8.8.8.8');
  fs.renameSync(tmp, dest); // atomic: readers see the old file or the new one, never half of one
  console.log(`\nInstalled ${dest}`);
  console.log(`  type ${type}, ${sizeMB.toFixed(1)} MB, built ${(buildDate(reader.metadata.buildEpoch) || 'unknown').slice(0, 10)}`);
  console.log(`  self-test: 8.8.8.8 -> ${probe?.city?.names?.en || '(no city)'}, ${probe?.country?.iso_code || '?'}`);
  if (/dbip/i.test(type)) console.log('\nThis data is © DB-IP.com, licensed CC BY 4.0 - keep the "IP Geolocation by DB-IP" credit that is shown with the location statistics.');
  console.log('A running server picks the new file up automatically.');
} catch (err) {
  fs.rmSync(tmp, { force: true });
  console.error(`\nThe download was not usable: ${err.message}\nYour existing database (if any) was left untouched.`);
  process.exit(1);
}
