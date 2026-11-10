import crypto from 'node:crypto';
import { config } from './config.js';

export const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

// Separate keys per purpose, all derived from the one application secret.
const keyFor = (purpose) => Buffer.from(crypto.hkdfSync('sha256', config.secret, 'linkhub', purpose, 32));

/** AES-256-GCM. Output: base64(iv | authTag | ciphertext). Used for two-factor secrets at rest. */
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor('at-rest'), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

export function decrypt(blob) {
  const raw = Buffer.from(blob, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor('at-rest'), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

/** Keyed hash for anonymous visitor ids. */
export function keyedHash(purpose, data) {
  return crypto.createHmac('sha256', keyFor(purpose)).update(data).digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
