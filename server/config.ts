import path from 'node:path';
import fs from 'node:fs';

// Resolves to the project root both for `server/*.ts` (dev) and `dist/server/index.js` (prod).
function findRoot(): string {
  let dir = import.meta.dirname;
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const ROOT = findRoot();
export const PORT = Number(process.env.PORT || 3000);
export const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'chopefix.db');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');
export const CLIENT_DIR = path.join(ROOT, 'dist', 'client');
export const DEMO_MODE = process.env.DEMO_MODE !== 'false';
export const AUTO_RELEASE_MS = 24 * 60 * 60 * 1000;
export const WARRANTY_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_FEE_BPS = 800; // 8% ChopeFix transaction fee
export const DEFAULT_RESERVE_BPS = 500; // 5% rolling workmanship reserve

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
