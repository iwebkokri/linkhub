import { resolveTheme } from './schemas.js';
import { setupNeeded } from './auth.js';
import { parseStoredJson, resolveIds } from './tracking.js';

/** `withTracking` adds the business' own tracking ids - only ever pass it for administrators. */
export function serializeBusiness(row, { withTracking = false } = {}) {
  let theme = {};
  try {
    theme = JSON.parse(row.theme || '{}');
  } catch {
    /* fall back to defaults */
  }
  const out = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tagline: row.tagline,
    bio: row.bio,
    logoUrl: row.logo_url,
    coverUrl: row.cover_url,
    theme: resolveTheme(theme),
    isActive: !!row.is_active,
    views: row.views,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (withTracking) out.tracking = resolveIds(parseStoredJson(row.tracking));
  if ('link_count' in row) out.linkCount = row.link_count;
  if ('clicks' in row) out.clicks = row.clicks;
  if ('member_count' in row) out.memberCount = row.member_count;
  return out;
}

export function serializeLink(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    platform: row.platform,
    title: row.title,
    url: row.url,
    display: row.display,
    isActive: !!row.is_active,
    position: row.position,
    clicks: row.clicks,
  };
}

export function serializeUser(row, businessIds) {
  const out = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: !!row.is_active,
    twoFactorEnabled: !!row.totp_enabled,
    createdAt: row.created_at,
    // What this person must still do before the app unlocks: ['password'], ['2fa'] or both.
    setupRequired: setupNeeded(row),
  };
  if (businessIds) out.businessIds = businessIds;
  return out;
}
