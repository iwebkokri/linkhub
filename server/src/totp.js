// Time-based one-time passwords (RFC 6238) - the 6-digit codes from Google Authenticator, Microsoft
// Authenticator, 1Password, Authy, etc. Verified against the RFC's published test vectors.
import crypto from 'node:crypto';
import { sha256, safeEqual } from './secrets.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(crypto.randomBytes(20)); // 160 bits

export function hotp(secret, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1] & 0xf;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/**
 * Returns the matching time step, or null. Accepts the previous/current/next 30-second window
 * (clock drift) and refuses any step at or before `lastStep`, so a code can only be used once.
 */
export function verifyTotp(secretBase32, token, { now = Date.now(), lastStep = 0, window = 1 } = {}) {
  const code = String(token ?? '').replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = Math.floor(now / 1000 / STEP_SECONDS);
  for (let w = -window; w <= window; w++) {
    const step = current + w;
    if (step <= lastStep) continue;
    if (safeEqual(hotp(secret, step), code)) return step;
  }
  return null;
}

export function otpauthUri({ secret, account, issuer }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

// ---- one-time recovery codes (for a lost phone) ---------------------------------------------

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const pick = () => Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    return `${pick()}-${pick()}`;
  });
}

export const normalizeRecoveryCode = (code) => String(code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const hashRecoveryCode = (code) => sha256(normalizeRecoveryCode(code));
