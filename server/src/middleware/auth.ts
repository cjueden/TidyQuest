import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../database';
import { currentFamily, isHosted, runInFamily } from '../hosted/context';
import { openFamily } from '../hosted/families';
import { isLocked } from '../hosted/accounts';

// Security: Require JWT_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production mode.');
  console.error('Generate a secure secret: openssl rand -base64 32');
  console.error('Set it in your .env file or docker-compose.yml');
  process.exit(1);
}

const JWT_SECRET: string = process.env.JWT_SECRET || (() => {
  const secret = require('crypto').randomBytes(32).toString('hex');
  console.warn('[WARN] JWT_SECRET not set — using random secret. Tokens will invalidate on restart. Set JWT_SECRET in your environment.');
  return secret;
})();

export interface AuthRequest extends Request {
  userId?: number;
  /** Hosted mode: the family this request belongs to. */
  familyId?: string;
}

type TokenPayload = { userId: number; v?: number; fid?: string };

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.slice(7);
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!isHosted()) return checkUser(req, res, next, payload);
  // Hosted mode: the token names the family. The rest of the request runs with that family's database.
  const family = openFamily(payload.fid);
  if (!family) return res.status(401).json({ error: 'Signed out' });
  req.familyId = family.familyId;
  // A family that hasn't confirmed a parent's email within 30 days can only confirm it and export (decision 3)
  const lockedOut = () => isLocked(family.familyId) && !OPEN_WHEN_LOCKED.test(req.originalUrl)
    ? res.status(403).json({ error: 'Confirm your email to keep using TidyQuest', code: 'confirm-email' })
    : next();
  runInFamily(family, () => checkUser(req, res, lockedOut, payload));
}

// What a locked family can still reach: its account (confirming, changing the email), its export, who's signed in
const OPEN_WHEN_LOCKED = /^\/api\/(hosted\/|export(\?|$)|auth\/me(\?|$))/;

function checkUser(req: AuthRequest, res: Response, next: NextFunction, payload: TokenPayload) {
  // Turn away a removed person, or a token from before their last "log out everywhere" or password
  // change. Tokens made before NEW-8 have no version and count as 0.
  const row = db.prepare('SELECT tokenVersion FROM users WHERE id = ?').get(payload.userId) as { tokenVersion: number } | undefined;
  if (!row || (payload.v ?? 0) !== row.tokenVersion) {
    return res.status(401).json({ error: 'Signed out' });
  }
  req.userId = payload.userId;
  next();
}

/** A login token for this person, carrying their current token version. */
export function generateToken(userId: number): string {
  const row = db.prepare('SELECT tokenVersion FROM users WHERE id = ?').get(userId) as { tokenVersion: number } | undefined;
  const fid = isHosted() ? currentFamily()?.familyId : undefined;
  return jwt.sign({ userId, v: row?.tokenVersion ?? 0, ...(fid && { fid }) }, JWT_SECRET, { expiresIn: '30d' });
}

/** Logs this person out on every device: their existing tokens stop working. */
export function revokeTokens(userId: number): void {
  db.prepare('UPDATE users SET tokenVersion = tokenVersion + 1 WHERE id = ?').run(userId);
}
