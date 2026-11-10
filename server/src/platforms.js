import { config } from './config.js';
import { HttpError } from './util.js';

// Keep in sync with client/src/platforms.jsx (which adds icons + colours).
export const PLATFORMS = [
  'website', 'facebook', 'instagram', 'x', 'tiktok', 'youtube', 'linkedin',
  'whatsapp', 'telegram', 'snapchat', 'pinterest', 'threads', 'discord',
  'spotify', 'google_maps', 'email', 'phone', 'other',
];

// A button with a platform's logo may only point at that platform. Otherwise a compromised or
// careless account could show an "Instagram" icon that leads to a look-alike login page.
// ("website" and "other" are unrestricted - pick those for anything else, e.g. a bit.ly link.)
const OWN_DOMAINS = {
  facebook: ['facebook.com', 'fb.com', 'fb.me', 'fb.watch', 'm.me'],
  instagram: ['instagram.com', 'instagr.am', 'ig.me'],
  x: ['x.com', 'twitter.com', 't.co'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
  linkedin: ['linkedin.com', 'lnkd.in'],
  whatsapp: ['wa.me', 'whatsapp.com', 'wa.link'],
  telegram: ['t.me', 'telegram.me', 'telegram.org'],
  snapchat: ['snapchat.com', 'snap.com'],
  pinterest: ['pinterest.com', 'pinterest.ca', 'pinterest.co.uk', 'pin.it'],
  threads: ['threads.net', 'threads.com'],
  discord: ['discord.gg', 'discord.com'],
  spotify: ['spotify.com', 'spoti.fi'],
  google_maps: ['google.com', 'google.ca', 'goo.gl', 'g.page', 'maps.apple.com', 'waze.com', 'openstreetmap.org', 'bing.com'],
};

const LABEL = {
  facebook: 'Facebook', instagram: 'Instagram', x: 'X (Twitter)', tiktok: 'TikTok', youtube: 'YouTube',
  linkedin: 'LinkedIn', whatsapp: 'WhatsApp', telegram: 'Telegram', snapchat: 'Snapchat',
  pinterest: 'Pinterest', threads: 'Threads', discord: 'Discord', spotify: 'Spotify', google_maps: 'a maps',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9()\-.\s]{5,25}$/;

const hostMatches = (host, domain) => host === domain || host.endsWith(`.${domain}`);

/**
 * Turn whatever an editor typed into a safe, canonical link target.
 * Only http(s), mailto: and tel: ever reach the public page, and the destination is vetted.
 */
export function normalizeTarget(platform, raw) {
  let v = String(raw || '').trim();
  if (!v) throw new HttpError(400, 'A link / URL is required');
  if (v.length > 2000) throw new HttpError(400, 'That link is too long');
  if (/[\u0000-\u001f\u007f]/.test(v)) throw new HttpError(400, 'That link contains invalid characters');

  if (platform === 'email') {
    v = v.replace(/^mailto:/i, '').trim();
    // No ?, & or % - those would let a mailto: link smuggle in extra recipients (bcc=) or a pre-written body.
    if (!EMAIL_RE.test(v) || v.length > 254 || /[,;<>"?&%]/.test(v)) throw new HttpError(400, 'Enter a valid email address');
    return `mailto:${v}`;
  }

  if (platform === 'phone') {
    v = v.replace(/^tel:/i, '').trim();
    if (!PHONE_RE.test(v)) throw new HttpError(400, 'Enter a valid phone number');
    return `tel:${v.replace(/[^\d+]/g, '')}`;
  }

  if (platform === 'whatsapp' && PHONE_RE.test(v)) {
    // A bare phone number becomes a wa.me chat link.
    return `https://wa.me/${v.replace(/\D/g, '')}`;
  }

  if (!/^https?:\/\//i.test(v)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^(javascript|data|vbscript|file|blob|about):/i.test(v)) {
      throw new HttpError(400, 'Only http:// and https:// links are allowed');
    }
    v = `https://${v.replace(/^\/+/, '')}`;
  }

  let url;
  try {
    url = new URL(v);
  } catch {
    throw new HttpError(400, 'That does not look like a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'Only http:// and https:// links are allowed');
  }

  // "https://paypal.com@evil.example" really goes to evil.example - a classic phishing disguise.
  if (url.username || url.password) {
    throw new HttpError(400, 'Links containing a username or password are not allowed');
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || /^\d+(\.\d+){0,3}$/.test(host)) {
    throw new HttpError(400, 'Links to a raw IP address are not allowed. Use the website\'s domain name.');
  }
  if (!host.includes('.') || host === 'localhost' || /\.(localhost|local|internal|lan|home|corp)$/.test(host)) {
    throw new HttpError(400, 'That does not look like a public website address');
  }
  if (!config.allowPunycodeLinks && host.split('.').some((label) => label.startsWith('xn--'))) {
    throw new HttpError(400, 'Domain names with look-alike (international) characters are not allowed, for visitors\' safety. Ask an administrator.');
  }
  if (config.blockedLinkDomains.some((d) => hostMatches(host, d))) {
    throw new HttpError(400, 'That website is not allowed on link pages');
  }

  const own = OWN_DOMAINS[platform];
  if (own && !own.some((d) => hostMatches(host, d))) {
    throw new HttpError(400, `That doesn't look like a ${LABEL[platform]} address. For any other website choose "Website" or "Other link".`);
  }

  return url.toString();
}
