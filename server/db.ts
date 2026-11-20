import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './config.ts';

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','contractor','admin')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contractors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  trade TEXT NOT NULL CHECK (trade IN ('Plumbing','Electrical','Handyman')),
  licence_type TEXT NOT NULL,
  licence_no TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 5.0,
  jobs_done INTEGER NOT NULL DEFAULT 0,
  years_exp INTEGER NOT NULL DEFAULT 1,
  bio TEXT NOT NULL DEFAULT '',
  initials TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade TEXT NOT NULL CHECK (trade IN ('Plumbing','Electrical','Handyman')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  scope TEXT NOT NULL,          -- JSON array of included items
  exclusions TEXT NOT NULL DEFAULT '[]',
  duration_min INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  compliance TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  catalog_id INTEGER NOT NULL REFERENCES catalog(id),
  contractor_id INTEGER REFERENCES contractors(id),
  status TEXT NOT NULL,
  job_title TEXT NOT NULL,
  trade TEXT NOT NULL,
  base_cents INTEGER NOT NULL,
  fee_bps INTEGER NOT NULL,
  reserve_bps INTEGER NOT NULL,
  postal_code TEXT NOT NULL,
  unit_no TEXT NOT NULL,
  area TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  window_date TEXT NOT NULL,
  window_slot TEXT NOT NULL,
  has_part INTEGER NOT NULL DEFAULT 0,
  payment_rail TEXT NOT NULL CHECK (payment_rail IN ('paynow','card')),
  payment_ref TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  checked_in_at INTEGER,
  completed_at INTEGER,
  auto_release_at INTEGER,
  released_at INTEGER,
  release_type TEXT,
  refunded_at INTEGER,
  warranty_until INTEGER,
  completion_note TEXT,
  gross_cents INTEGER,
  fee_cents INTEGER,
  reserve_cents INTEGER,
  net_cents INTEGER
);
CREATE TABLE IF NOT EXISTS addons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','declined')),
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  issue TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','resolved')),
  contractor_note TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('open','released','refunded')),
  resolution_note TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  claim_id INTEGER REFERENCES claims(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('before','after','rework')),
  url TEXT NOT NULL,
  lat REAL,
  lng REAL,
  taken_at INTEGER NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_contractor ON bookings(contractor_id);
`);

export type Row = Record<string, any>;

export function one<T = Row>(sql: string, ...params: any[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
export function all<T = Row>(sql: string, ...params: any[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
export function run(sql: string, ...params: any[]) {
  return db.prepare(sql).run(...params);
}
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getSetting(key: string, fallback: number): number {
  const r = one<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return r ? Number(r.value) : fallback;
}
