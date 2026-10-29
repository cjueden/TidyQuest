import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../database';

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
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.slice(7);
  let payload: { userId: number; v?: number };
  try {
    payload = jwt.verify(token, JWT_SECRET) as { userId: number; v?: number };
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
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
  return jwt.sign({ userId, v: row?.tokenVersion ?? 0 }, JWT_SECRET, { expiresIn: '30d' });
}

/** Logs this person out on every device: their existing tokens stop working. */
export function revokeTokens(userId: number): void {
  db.prepare('UPDATE users SET tokenVersion = tokenVersion + 1 WHERE id = ?').run(userId);
}
