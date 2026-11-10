import { z } from 'zod';
import { db } from './db.js';

// Empty string / null clear the id (the editor sends back whatever the server gave it, which is null
// for "not set"); anything else must look like a real id for that product.
const optionalId = (re, message) =>
  z
    .union([z.literal(''), z.null(), z.string().trim().toUpperCase().regex(re, message)])
    .transform((v) => v || null);

export const trackingIdsSchema = z
  .object({
    ga4Id: optionalId(/^G-[A-Z0-9]{4,14}$/, 'Google Analytics 4 IDs look like G-XXXXXXXXXX'),
    gtmId: optionalId(/^GTM-[A-Z0-9]{4,12}$/, 'Google Tag Manager IDs look like GTM-XXXXXXX'),
    metaPixelId: optionalId(/^\d{8,20}$/, 'Meta Pixel IDs are 8-20 digits'),
    tiktokPixelId: optionalId(/^[A-Z0-9]{10,30}$/, 'TikTok Pixel IDs are letters and numbers, e.g. C1A2B3D4E5F6G7H8'),
  })
  .partial();

export const globalTrackingSchema = trackingIdsSchema.extend({ requireConsent: z.boolean().optional() });

const EMPTY_IDS = { ga4Id: null, gtmId: null, metaPixelId: null, tiktokPixelId: null };

// Stored values were validated when they were saved, so just pick the known keys (null = not set).
export function resolveIds(stored) {
  const out = { ...EMPTY_IDS };
  for (const key of Object.keys(EMPTY_IDS)) {
    if (typeof stored?.[key] === 'string' && stored[key]) out[key] = stored[key];
  }
  return out;
}

export function parseStoredJson(text) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}

// ---- global (all businesses) settings --------------------------------------

export function getGlobalTracking() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'tracking'").get();
  const stored = parseStoredJson(row?.value);
  return { ...resolveIds(stored), requireConsent: stored.requireConsent === true };
}

export function saveGlobalTracking(patch) {
  const next = { ...getGlobalTracking(), ...patch };
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('tracking', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify(next));
  return next;
}

/** What the public page needs: the ids to load (company-wide + this business), de-duplicated. */
export function publicTracking(businessRow) {
  const g = getGlobalTracking();
  const b = resolveIds(parseStoredJson(businessRow.tracking));
  const uniq = (...v) => [...new Set(v.filter(Boolean))];
  return {
    ga4: uniq(g.ga4Id, b.ga4Id),
    gtm: uniq(g.gtmId, b.gtmId),
    metaPixel: uniq(g.metaPixelId, b.metaPixelId),
    tiktokPixel: uniq(g.tiktokPixelId, b.tiktokPixelId),
    requireConsent: g.requireConsent,
  };
}
