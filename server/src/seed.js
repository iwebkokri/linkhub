// Usage:
//   npm run seed          -> make sure the first admin exists
//   npm run seed:demo     -> also add two sample businesses + a sample team member (development only)
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { db } from './db.js';
import { ensureAdmin } from './bootstrap.js';
import { DEFAULT_THEME } from './schemas.js';
import { generatePassword } from './passwords.js';

await ensureAdmin();

if (process.argv.includes('--demo')) {
  if (config.isProd) {
    console.error('Refusing to add demo data (with a known password) when NODE_ENV=production.');
    process.exit(1);
  }
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM businesses').get();
  if (c > 0) {
    console.log('[demo] Businesses already exist - skipping demo data.');
    process.exit(0);
  }

  const addBusiness = db.prepare(
    'INSERT INTO businesses (name, slug, tagline, bio, theme) VALUES (?, ?, ?, ?, ?)',
  );
  const addLink = db.prepare(
    'INSERT INTO links (business_id, platform, title, url, display, position) VALUES (?, ?, ?, ?, ?, ?)',
  );

  const cafe = addBusiness.run(
    'Sunrise Cafe',
    'sunrise-cafe',
    'Fresh coffee & breakfast, all day',
    'Family-run cafe serving locally roasted coffee and homemade pastries. Come say hi!',
    JSON.stringify({ ...DEFAULT_THEME, background: '#fff4e0', background2: '#ffd9a0', button: '#7a3e00', buttonText: '#ffffff', buttonStyle: 'pill' }),
  ).lastInsertRowid;
  [
    ['website', 'Order online', 'https://example.com/order', 'button'],
    ['google_maps', 'Find us on Google Maps', 'https://maps.google.com/', 'button'],
    ['website', 'View our menu', 'https://example.com/menu', 'button'],
    ['instagram', 'Instagram', 'https://instagram.com/', 'icon'],
    ['facebook', 'Facebook', 'https://facebook.com/', 'icon'],
    ['tiktok', 'TikTok', 'https://tiktok.com/', 'icon'],
    ['email', 'Email us', 'mailto:hello@example.com', 'icon'],
  ].forEach(([platform, title, url, display], i) => addLink.run(cafe, platform, title, url, display, i));

  const events = addBusiness.run(
    'Northside Events',
    'northside-events',
    'Conferences, concerts & community events',
    'We run events people remember. Tickets, schedules and updates below.',
    JSON.stringify({ ...DEFAULT_THEME, background: '#0f172a', background2: '#1e3a8a', text: '#ffffff', button: '#38bdf8', buttonText: '#0f172a', buttonStyle: 'rounded' }),
  ).lastInsertRowid;
  [
    ['website', 'Buy tickets', 'https://example.com/tickets', 'button'],
    ['website', 'Event schedule', 'https://example.com/schedule', 'button'],
    ['whatsapp', 'Chat on WhatsApp', 'https://wa.me/15555550123', 'button'],
    ['youtube', 'YouTube', 'https://youtube.com/', 'icon'],
    ['linkedin', 'LinkedIn', 'https://linkedin.com/', 'icon'],
    ['x', 'X', 'https://x.com/', 'icon'],
  ].forEach(([platform, title, url, display], i) => addLink.run(events, platform, title, url, display, i));

  const teamPassword = process.env.DEMO_PASSWORD || generatePassword(); // random every time: no well-known demo credentials
  const hash = await bcrypt.hash(teamPassword, 12);
  const member = db
    .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'member')")
    .run('Sample Team Member', 'team@example.com', hash).lastInsertRowid;
  db.prepare('INSERT INTO business_members (business_id, user_id) VALUES (?, ?)').run(cafe, member);

  console.log('[demo] Added 2 businesses (sunrise-cafe, northside-events) and a sample team member assigned to Sunrise Cafe:');
  console.log(`[demo]    team@example.com  /  ${teamPassword}`);
}
