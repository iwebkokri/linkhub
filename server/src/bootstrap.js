import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { db } from './db.js';
import { assertStrongPassword, generatePassword, MIN_PASSWORD } from './passwords.js';

/** Creates the first administrator when the database has no users yet. */
export async function ensureAdmin() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (c > 0) return;

  let { name, email, password } = config.admin;

  if (!email || !password) {
    if (config.isProd) {
      console.error('FATAL: No users exist yet. Create the first administrator, then start again:');
      console.error('         npm run admin -- create you@yourdomain.com --name "Your Name" --generate');
      console.error('       (or set ADMIN_EMAIL and ADMIN_PASSWORD in .env for the first start).');
      process.exit(1);
    }
    // Development convenience without a well-known default: a random password, shown once.
    email = email || 'admin@example.com';
    password = generatePassword();
    console.warn('[setup] ADMIN_EMAIL / ADMIN_PASSWORD not set - created a development admin with a random password:');
    console.warn(`[setup]    ${email}  /  ${password}`);
  }

  try {
    if (password.length < MIN_PASSWORD) throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD} characters.`);
    assertStrongPassword(password, { email, name });
  } catch (err) {
    console.error(`FATAL: ${err.message}`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  db.prepare(
    "INSERT INTO users (name, email, password_hash, role, password_changed_at) VALUES (?, ?, ?, 'admin', datetime('now'))",
  ).run(name, email, hash);
  console.log(`[setup] Created administrator account: ${email}`);
}
