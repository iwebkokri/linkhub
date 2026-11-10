import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Only the account that runs the app may read the database (ignored on Windows).
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(config.uploadDir, { recursive: true, mode: 0o750 });

const dbFile = path.join(config.dataDir, 'linktree.db');
export const db = new Database(dbFile);
try {
  fs.chmodSync(dbFile, 0o600); // the -wal / -shm files SQLite creates later inherit this
} catch {
  /* best effort */
}
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS businesses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  slug       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  tagline    TEXT    NOT NULL DEFAULT '',
  bio        TEXT    NOT NULL DEFAULT '',
  logo_url   TEXT,
  cover_url  TEXT,
  theme      TEXT    NOT NULL DEFAULT '{}',
  tracking   TEXT    NOT NULL DEFAULT '{}',
  is_active  INTEGER NOT NULL DEFAULT 1,
  views      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Which team members are assigned to which business listing.
CREATE TABLE IF NOT EXISTS business_members (
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  assigned_at TEXT    NOT NULL DEFAULT (datetime('now')),
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (business_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON business_members(user_id);

CREATE TABLE IF NOT EXISTS links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform    TEXT    NOT NULL DEFAULT 'website',
  title       TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  display     TEXT    NOT NULL DEFAULT 'button' CHECK (display IN ('button', 'icon')),
  is_active   INTEGER NOT NULL DEFAULT 1,
  position    INTEGER NOT NULL DEFAULT 0,
  clicks      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_links_business ON links(business_id, position);

-- Internal analytics: one row per page view / link click, so every business and every
-- link has its own history. No IP addresses or cookies are stored; "visitor" is a
-- one-way hash that changes every day.
CREATE TABLE IF NOT EXISTS page_views (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day         TEXT    NOT NULL,              -- YYYY-MM-DD in STATS_TIMEZONE
  ts          TEXT    NOT NULL DEFAULT (datetime('now')),
  visitor     TEXT    NOT NULL,
  source      TEXT    NOT NULL DEFAULT '',   -- utm_source or referrer host ('' = direct)
  device      TEXT    NOT NULL DEFAULT 'desktop'
);
CREATE INDEX IF NOT EXISTS idx_views_business_day ON page_views(business_id, day);

CREATE TABLE IF NOT EXISTS link_clicks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id     INTEGER NOT NULL REFERENCES links(id)      ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day         TEXT    NOT NULL,
  ts          TEXT    NOT NULL DEFAULT (datetime('now')),
  visitor     TEXT    NOT NULL,
  device      TEXT    NOT NULL DEFAULT 'desktop'
);
CREATE INDEX IF NOT EXISTS idx_clicks_link_day     ON link_clicks(link_id, day);
CREATE INDEX IF NOT EXISTS idx_clicks_business_day ON link_clicks(business_id, day);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Login sessions. The browser holds a random token; only its SHA-256 is stored here, so a copy
-- of the database can't be used to sign in. Deleting a row signs that device out immediately.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- One-time codes for people who lose their authenticator app (stored hashed).
CREATE TABLE IF NOT EXISTS recovery_codes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT    NOT NULL,
  used_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id);

-- Who did what, and when. Append-only from the app's point of view.
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT    NOT NULL DEFAULT (datetime('now')),
  user_id    INTEGER,
  user_email TEXT,
  action     TEXT    NOT NULL,
  target     TEXT,
  detail     TEXT,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
`);

// Light-weight migrations for databases created by an older version of the app.
function addColumnIfMissing(table, column, ddl) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
addColumnIfMissing('businesses', 'tracking', "TEXT NOT NULL DEFAULT '{}'");
addColumnIfMissing('users', 'totp_secret', 'TEXT'); // encrypted; set while enrolling, live once totp_enabled = 1
addColumnIfMissing('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'totp_last_step', 'INTEGER NOT NULL DEFAULT 0'); // blocks re-use of a code
addColumnIfMissing('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'password_changed_at', 'TEXT');

export function isUniqueViolation(err) {
  return err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');
}
