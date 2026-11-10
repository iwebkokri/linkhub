import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { HttpError } from './util.js';

export const MIN_PASSWORD = 12;
const MAX_BYTES = 72; // bcrypt only uses the first 72 bytes; refuse anything longer rather than silently truncate

// Fragments that make a password guessable. Only applied to short passwords: a long passphrase may contain a word.
const WEAK_FRAGMENTS = ['password', 'passw0rd', 'qwerty', '123456', 'letmein', 'welcome', 'changeme', 'iloveyou', 'admin', 'abc123', '111111'];

/** Shape check, usable inside zod schemas. */
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`)
  .refine((p) => Buffer.byteLength(p) <= MAX_BYTES, `Password must be at most ${MAX_BYTES} bytes`);

/** Throws a friendly 400 if the password is too guessable. `context` = { email, name } of the account. */
export function assertStrongPassword(password, context = {}) {
  const lower = password.toLowerCase();
  const fail = (why) => {
    throw new HttpError(400, `That password is too easy to guess: ${why}. Use a longer passphrase or a random one from a password manager.`);
  };
  if (/^(.)\1+$/.test(password)) fail('it is one repeated character');
  if (/^\d+$/.test(password)) fail('it is only digits');
  if (new Set(password).size < 5) fail('it uses too few different characters');
  if (password.length < 16 && [...WEAK_FRAGMENTS, ...config.weakPasswordWords].some((w) => lower.includes(w))) fail('it contains a very common word or pattern');
  const local = String(context.email || '').split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) fail('it contains your email address');
  const name = String(context.name || '').toLowerCase().replace(/\s+/g, '');
  if (name.length >= 4 && lower.includes(name)) fail('it contains your name');
}

/** Random strong password for the CLI / first-run (no look-alike characters, always mixed classes). */
export function generatePassword(length = 24) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!#%-_.=+'];
  const all = sets.join('');
  for (;;) {
    const pw = Array.from({ length }, () => all[crypto.randomInt(all.length)]).join('');
    if (sets.every((set) => [...pw].some((c) => set.includes(c)))) return pw;
  }
}
