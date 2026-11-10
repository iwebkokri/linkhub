import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function parseId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${label}`);
  return n;
}

// URL paths that can never be used as a business slug (they are app routes).
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'uploads', 'assets', 'login', 'logout', 'static', 'public',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'healthz', 'health', 'index.html',
]);

export function slugify(input) {
  return String(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
}

// Delete an uploaded file if (and only if) the URL points inside our uploads folder.
export function removeUploadByUrl(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const file = path.join(config.uploadDir, path.basename(url));
  fs.promises.unlink(file).catch(() => {});
}
