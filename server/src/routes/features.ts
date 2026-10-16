import { Router, Response } from 'express';
import db from '../database';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { ensureAdmin } from '../utils/adminHelpers';
import { FEATURES, HOLIDAYS, getFeatures, holidaysOff, rescueMultiplier } from '../utils/features';

/** Settings → Features: switch optional extras on or off for the whole family. */
const router = Router();
router.use(authMiddleware);

const view = () => ({ features: getFeatures(), rescueMultiplier: rescueMultiplier(), holidaysOff: holidaysOff() });

router.get('/', (_req: AuthRequest, res: Response) => res.json(view()));

router.put('/', (req: AuthRequest, res: Response) => {
  if (!ensureAdmin(req.userId)) return res.status(403).json({ error: 'Admin only' });
  const incoming = req.body?.features;
  if (incoming && typeof incoming === 'object') {
    const next = { ...getFeatures() };
    for (const f of FEATURES) if (typeof incoming[f] === 'boolean') next[f] = incoming[f];
    // Only what's off is stored, so new extras start on
    const off = Object.fromEntries(FEATURES.filter((f) => !next[f]).map((f) => [f, false]));
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('features', ?)").run(JSON.stringify(off));
  }
  if (req.body?.rescueMultiplier !== undefined) {
    const m = Number(req.body.rescueMultiplier);
    if (!(m >= 1.5 && m <= 5)) return res.status(400).json({ error: 'invalid_multiplier' });
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('rescueMultiplier', ?)").run(String(m));
  }
  // Seasonal styling: holidays switched off one by one
  const hOff = req.body?.holidaysOff;
  if (hOff !== undefined) {
    if (!Array.isArray(hOff) || hOff.some((h) => !(HOLIDAYS as readonly string[]).includes(h))) return res.status(400).json({ error: 'invalid_holiday' });
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('holidaysOff', ?)").run(JSON.stringify([...new Set(hOff)]));
  }
  res.json(view());
});

export default router;
