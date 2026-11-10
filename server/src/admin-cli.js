// Server-side account recovery - there is no "forgot password" e-mail, so this is how you get back in.
// Run it on the server, from the server/ folder:
//
//   node src/admin-cli.js reset <email> [--generate] [--disable-2fa]   new password and/or switch 2FA off
//   node src/admin-cli.js create <email> --name "Full Name" --generate  create an administrator
//   node src/admin-cli.js change-email <old-email> <new-email>
//   node src/admin-cli.js remove <email>
//   node src/admin-cli.js revoke-sessions [email]                      sign someone (or everyone) out
//
// Passwords are never taken from the command line (they would end up in shell history and process lists):
// use --generate to get a random one printed once, or set ADMIN_PASSWORD in the environment for the command.
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { endUserSessions } from './auth.js';
import { audit } from './audit.js';
import { assertStrongPassword, generatePassword } from './passwords.js';

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--') && !a.includes('=')));
const named = Object.fromEntries(
  rest.flatMap((a, i) => (a === '--name' ? [['name', rest[i + 1]]] : [])),
);
const positional = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--name');
const normalize = (e) => String(e || '').trim().toLowerCase();

const die = (msg) => {
  console.error(`Error: ${msg}`);
  process.exit(1);
};
const find = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(normalize(email));
const log = (action, target, detail) => audit(null, action, target, detail ? `${detail} (via server CLI)` : '(via server CLI)', { email: 'server-cli' });

async function pickPassword(user) {
  let pw;
  if (flags.has('--generate')) pw = generatePassword();
  else if (process.env.ADMIN_PASSWORD) pw = process.env.ADMIN_PASSWORD;
  else return null;
  try {
    assertStrongPassword(pw, { email: user.email, name: user.name });
    if (pw.length < 12) throw new Error('Password must be at least 12 characters');
  } catch (err) {
    die(err.message);
  }
  return pw;
}

switch (command) {
  case 'reset': {
    const user = find(positional[0]) ?? die('No user with that email.');
    const pw = await pickPassword(user);
    if (!pw && !flags.has('--disable-2fa')) die('Nothing to do: add --generate (new password) and/or --disable-2fa.');
    if (pw) {
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = datetime('now'), is_active = 1 WHERE id = ?").run(await bcrypt.hash(pw, 12), user.id);
      log('user.password_reset', user.email);
    }
    if (flags.has('--disable-2fa')) {
      db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = 0 WHERE id = ?').run(user.id);
      db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
      log('user.2fa_reset', user.email);
    }
    endUserSessions(user.id);
    console.log(`Updated ${user.email}. All of their sessions were signed out.`);
    if (pw && flags.has('--generate')) console.log(`\nNew password (shown once - store it in a password manager):\n\n    ${pw}\n`);
    break;
  }
  case 'create': {
    const email = normalize(positional[0]) || die('Give an email address.');
    if (find(email)) die('A user with that email already exists.');
    const user = { email, name: named.name || 'Administrator' };
    const pw = (await pickPassword(user)) ?? die('Add --generate (or set ADMIN_PASSWORD for this command).');
    db.prepare("INSERT INTO users (name, email, password_hash, role, password_changed_at) VALUES (?, ?, ?, 'admin', datetime('now'))").run(user.name, email, await bcrypt.hash(pw, 12));
    log('user.created', email, 'administrator');
    console.log(`Created administrator ${email}.`);
    if (flags.has('--generate')) console.log(`\nPassword (shown once - store it in a password manager):\n\n    ${pw}\n`);
    break;
  }
  case 'change-email': {
    const user = find(positional[0]) ?? die('No user with the old email.');
    const next = normalize(positional[1]) || die('Give the new email address.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) die('That is not a valid email address.');
    if (find(next)) die('Someone already uses the new email.');
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(next, user.id);
    endUserSessions(user.id);
    log('user.updated', next, `email ${user.email} -> ${next}`);
    console.log(`Changed ${user.email} to ${next}. Their sessions were signed out.`);
    break;
  }
  case 'remove': {
    const user = find(positional[0]) ?? die('No user with that email.');
    if (user.role === 'admin' && db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?").get(user.id).c === 0) {
      die('That is the only active administrator.');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    log('user.deleted', user.email);
    console.log(`Removed ${user.email}.`);
    break;
  }
  case 'revoke-sessions': {
    if (positional[0]) {
      const user = find(positional[0]) ?? die('No user with that email.');
      endUserSessions(user.id);
      log('auth.sessions_revoked', user.email);
      console.log(`Signed ${user.email} out everywhere.`);
    } else {
      db.prepare('DELETE FROM sessions').run();
      log('auth.sessions_revoked', 'everyone');
      console.log('Signed everyone out.');
    }
    break;
  }
  default:
    console.log('Commands: reset | create | change-email | remove | revoke-sessions  (see the comment at the top of src/admin-cli.js)');
    process.exit(command ? 1 : 0);
}
