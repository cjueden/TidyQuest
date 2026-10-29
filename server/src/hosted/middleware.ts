import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { isHosted, runInFamily } from './context';
import { openFamily } from './families';

/**
 * Before login (the login itself, and the login page's avatars and registration status), hosted mode
 * takes the family from the request: `familyId` in the body or `?family=` in the address. A stand-in
 * until NEW-10 finds it from the family code or the parent's email. No family means 404, never a guess.
 */
export function familyFromRequest(req: AuthRequest, res: Response, next: NextFunction) {
  if (!isHosted()) return next();
  const family = openFamily(req.body?.familyId ?? req.query.family);
  if (!family) return res.status(404).json({ error: 'Family not found' });
  req.familyId = family.familyId;
  runInFamily(family, next);
}
