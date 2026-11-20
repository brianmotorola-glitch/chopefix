import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { one, run } from './db.ts';

const COOKIE = 'cf_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionUser = { id: number; email: string; name: string; phone: string | null; role: 'customer' | 'contractor' | 'admin'; is_demo: number; contractor_id: number | null };
export type AuthedRequest = Request & { user?: SessionUser };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function startSession(res: Response, userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', token, userId, now, now + SESSION_MS);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'true', maxAge: SESSION_MS, path: '/' });
  return token;
}

export function endSession(req: Request, res: Response) {
  const token = tokenFrom(req);
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  res.clearCookie(COOKIE, { path: '/' });
}

function tokenFrom(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return parseCookies(req.headers.cookie)[COOKIE];
}

export function loadUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = tokenFrom(req);
  if (token) {
    const u = one<SessionUser>(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.is_demo, c.id AS contractor_id
       FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN contractors c ON c.user_id = u.id
       WHERE s.token = ? AND s.expires_at > ?`, token, Date.now());
    if (u) req.user = u;
  }
  next();
}

export function requireRole(...roles: SessionUser['role'][]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: `This action needs a ${roles.join(' or ')} account.` });
    next();
  };
}
